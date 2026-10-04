from __future__ import annotations

import asyncio
import base64
import binascii
from datetime import datetime, timezone
from dataclasses import dataclass
import time
from typing import Any

from flask import Response, current_app, request

from app.extensions import db
from app.models import CallLog, CallLogErrorFlag, CallLogTranscriptEvent, Order
from app.models.enums import CallStatus
from app.services.audio_bridge import AudioBridge
from app.services.customers import get_or_create_customer
from app.services.gemini_live import GeminiLiveProvider
from app.services.twilio_voice import TwilioVoiceAdapter
from app.services.voice_runtime import VoiceRuntimeConfig, build_gemini_system_prompt
from app.services.voice_tools import OrderTools, VOICE_FUNCTION_DECLARATIONS, record_voice_tool_call
from app.utils.phone import normalize_phone_number


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class InboundAudioFrame:
    pcm: bytes
    received_monotonic: float
    duration_ms: float


def _join_transcript_pieces(pieces: list[str]) -> str:
    current = ""
    for raw_piece in pieces:
        piece = " ".join(str(raw_piece or "").split())
        if not piece:
            continue
        separator = "" if piece[0] in ".,!?;:%)]}" or current.endswith(("¿", "¡", "(", "[", "{", '"')) else " "
        current += separator + piece
    return current


def get_or_create_call_log(
    *,
    business,
    caller_phone: str | None,
    to_number: str | None,
    call_sid: str | None,
) -> CallLog:
    if call_sid:
        existing = CallLog.query.filter_by(provider_call_sid=call_sid).first()
        if existing:
            return existing

    started_at = _now_utc()
    normalized_caller = normalize_phone_number(caller_phone) or "desconocido"
    customer = get_or_create_customer(
        business_id=business.id,
        phone_number=normalized_caller,
        last_call_at=started_at,
    )
    item = CallLog(
        business_id=business.id,
        customer=customer,
        phone_number=normalized_caller,
        to_number=normalize_phone_number(to_number),
        provider_call_sid=call_sid,
        start_time=started_at,
        status=CallStatus.INCOMPLETE,
        session_state="connecting",
        draft_cart={"version": 1, "revision": 0, "items": [], "checkout": {}, "quote": None},
    )
    db.session.add(item)
    db.session.commit()
    return item


def build_twilio_stream_response(*, runtime, business, call_log) -> str:
    del business  # Tenant identity is already persisted on the signed CallLog.
    adapter = TwilioVoiceAdapter(
        runtime=runtime,
        secret_key=current_app.config["SECRET_KEY"],
    )
    return adapter.build_stream_twiml(call_log)


def map_twilio_call_status(status: str | None) -> CallStatus:
    normalized = (status or "").strip().lower()
    if normalized == "completed":
        return CallStatus.COMPLETED
    if normalized in {"failed", "busy", "no-answer", "canceled"}:
        return CallStatus.FAILED
    if normalized in {"in-progress", "ringing", "queued", "initiated"}:
        return CallStatus.INCOMPLETE
    return CallStatus.DROPPED


class TwilioGeminiBridge:
    AUDIO_QUEUE_CHUNKS = 250

    def __init__(self, ws: Any, app: Any):
        self.ws = ws
        self.app = app
        self.runtime = VoiceRuntimeConfig.from_app_config(app.config)
        self.twilio = TwilioVoiceAdapter(
            runtime=self.runtime,
            secret_key=app.config["SECRET_KEY"],
            ws=ws,
        )
        self.audio = AudioBridge()
        self.session = None
        self.business = None
        self.call_log = None
        self._stream_active = True
        self._conversation_lines: list[str] = []
        self._input_transcript_events: list[str] = []
        self._output_transcript_events: list[str] = []
        self._assistant_turns: list[str] = []
        self._turn_had_audio = False
        self._mark_counter = 0
        self._transcript_event_sequence = 0
        self._pending_transcript_events = 0
        self._last_twilio_sequence: int | None = None
        self._last_media_chunk: int | None = None
        self._last_media_timestamp: float | None = None
        self._last_media_duration_ms = 0.0
        self.voice_metrics = {
            "twilio_messages": 0,
            "media_frames_received": 0,
            "media_frames_sent_to_gemini": 0,
            "audio_received_ms": 0.0,
            "audio_sent_ms": 0.0,
            "sequence_gaps": 0,
            "media_chunk_gaps": 0,
            "timestamp_gap_ms": 0.0,
            "audio_frames_dropped": 0,
            "audio_dropped_ms": 0.0,
            "queue_high_water_chunks": 0,
            "queue_wait_ms_total": 0.0,
            "queue_wait_ms_max": 0.0,
            "gemini_send_ms_total": 0.0,
            "gemini_send_ms_max": 0.0,
            "transcript_events": 0,
            "interim_transcript_events": 0,
        }

    def _capture_sequence_number(self, event: dict[str, Any]) -> None:
        try:
            sequence = int(event.get("sequenceNumber"))
        except (TypeError, ValueError):
            return
        if self._last_twilio_sequence is not None and sequence > self._last_twilio_sequence + 1:
            self.voice_metrics["sequence_gaps"] += sequence - self._last_twilio_sequence - 1
        self._last_twilio_sequence = sequence

    def _capture_media_metadata(self, media: dict[str, Any], duration_ms: float) -> None:
        try:
            chunk = int(media.get("chunk"))
        except (TypeError, ValueError):
            chunk = None
        if chunk is not None:
            if self._last_media_chunk is not None and chunk > self._last_media_chunk + 1:
                self.voice_metrics["media_chunk_gaps"] += chunk - self._last_media_chunk - 1
            self._last_media_chunk = chunk
        try:
            timestamp = float(media.get("timestamp"))
        except (TypeError, ValueError):
            timestamp = None
        if timestamp is not None:
            if self._last_media_timestamp is not None:
                gap = timestamp - (self._last_media_timestamp + self._last_media_duration_ms)
                if gap > 40:
                    self.voice_metrics["timestamp_gap_count"] = self.voice_metrics.get("timestamp_gap_count", 0) + 1
                    self.voice_metrics["timestamp_gap_ms"] += gap
            self._last_media_timestamp = timestamp
            self._last_media_duration_ms = duration_ms

    def _record_dropped_frame(self, frame: InboundAudioFrame | None) -> None:
        if frame is None:
            return
        self.voice_metrics["audio_frames_dropped"] += 1
        self.voice_metrics["audio_dropped_ms"] += frame.duration_ms

    def _account_queued_audio(self, queue: asyncio.Queue[InboundAudioFrame | None]) -> None:
        while not queue.empty():
            try:
                frame = queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            if frame is not None:
                self._record_dropped_frame(frame)

    def _save_voice_metrics(self) -> None:
        if not self.call_log or not self.runtime.voice_audio_diagnostics:
            return
        metrics = dict(self.voice_metrics)
        sent = max(int(metrics.get("media_frames_sent_to_gemini", 0)), 1)
        metrics["queue_wait_ms_average"] = round(metrics.get("queue_wait_ms_total", 0.0) / sent, 2)
        metrics["gemini_send_ms_average"] = round(metrics.get("gemini_send_ms_total", 0.0) / sent, 2)
        metrics["audio_received_ms"] = round(metrics.get("audio_received_ms", 0.0), 2)
        metrics["audio_sent_ms"] = round(metrics.get("audio_sent_ms", 0.0), 2)
        metrics["audio_dropped_ms"] = round(metrics.get("audio_dropped_ms", 0.0), 2)
        metrics["timestamp_gap_ms"] = round(metrics.get("timestamp_gap_ms", 0.0), 2)
        metrics["model"] = self.runtime.gemini_model
        metrics["transcript_events_v2"] = self.runtime.voice_transcript_events_v2
        metrics["audio_diagnostics"] = self.runtime.voice_audio_diagnostics
        self.call_log.voice_metrics = metrics

    def _store_transcript_event(
        self,
        event_type: str,
        *,
        speaker: str | None = None,
        raw_text: str | None = None,
        details: dict[str, Any] | None = None,
        received_at: datetime | None = None,
    ) -> None:
        if not self.call_log or not self.runtime.voice_transcript_events_v2:
            return
        self._transcript_event_sequence += 1
        db.session.add(
            CallLogTranscriptEvent(
                call_log_id=self.call_log.id,
                receive_sequence=self._transcript_event_sequence,
                event_type=event_type[:40],
                speaker=speaker[:16] if speaker else None,
                model=self.runtime.gemini_model,
                raw_text=str(raw_text)[:4000] if raw_text is not None else None,
                received_at=received_at or _now_utc(),
                details={key: value for key, value in (details or {}).items() if key not in {"handle", "payload"}},
            )
        )
        self._pending_transcript_events += 1
        self.voice_metrics["transcript_events"] += 1
        if event_type == "input_transcript_interim":
            self.voice_metrics["interim_transcript_events"] += 1
        if self._pending_transcript_events >= 25:
            self._save_voice_metrics()
            db.session.commit()
            self._pending_transcript_events = 0

    async def run(self) -> None:
        with self.app.app_context():
            inbound_audio: asyncio.Queue[InboundAudioFrame | None] = asyncio.Queue(
                maxsize=self.AUDIO_QUEUE_CHUNKS
            )
            twilio_task = None
            send_task = None
            gemini_task = None
            try:
                if not self.twilio.validate_websocket():
                    self.app.logger.warning("Rejected Media Stream with invalid Twilio signature")
                    return
                if not await self._await_start_event():
                    self.app.logger.warning("Rejected Media Stream with invalid start context")
                    return

                # The webhook has no business context yet, so the bridge starts
                # with the environment fallback. Once Twilio sends the start
                # event, switch both adapters to this business's saved voice.
                self.runtime = VoiceRuntimeConfig.from_app_config(
                    self.app.config,
                    business=self.business,
                )
                self.twilio.runtime = self.runtime

                self.call_log.provider_stream_sid = self.session.stream_sid
                self.call_log.session_state = "active"
                self.call_log.gemini_model = self.runtime.gemini_model
                self._save_voice_metrics()
                db.session.commit()

                system_prompt = (
                    f"{build_gemini_system_prompt(self.business)}\n\n"
                    f"Teléfono del cliente actual: {self.session.caller_phone}. "
                    "Estás recibiendo su audio en tiempo real. No pidas ni aceptes un identificador de negocio."
                )
                provider = GeminiLiveProvider(
                    runtime=self.runtime,
                    system_prompt=system_prompt,
                    function_declarations=VOICE_FUNCTION_DECLARATIONS,
                )
                tools = OrderTools(
                    session=self.session,
                    business=self.business,
                    call_log=self.call_log,
                    twilio_adapter=self.twilio,
                )
                # Start reading before Gemini connects and speaks its greeting so
                # the caller's opening words enter the same bounded live queue.
                twilio_task = asyncio.create_task(self._receive_twilio(inbound_audio))
                async with provider.connect() as gemini_session:
                    send_task = asyncio.create_task(
                        self._send_audio_to_gemini(provider, gemini_session, inbound_audio)
                    )
                    welcome = (
                        self.business.bot_config.welcome_message
                        if self.business.bot_config and self.business.bot_config.welcome_message
                        else f"Gracias por llamar a {self.business.name}. ¿En qué te puedo ayudar?"
                    )
                    await provider.start_greeting(gemini_session, welcome)
                    gemini_task = asyncio.create_task(
                        self._receive_gemini(provider, gemini_session, tools)
                    )
                    tasks = {twilio_task, send_task, gemini_task}
                    done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    if twilio_task in done and twilio_task.exception() is None:
                        # stop/disconnect inserts a sentinel after the final frame;
                        # let the sender account for and drain frames already queued.
                        await send_task
                    elif send_task in done and send_task.exception() is None and twilio_task.done():
                        pass
                    else:
                        for task in done:
                            exception = task.exception()
                            if exception:
                                raise exception
                        self._record_error("gemini_stream_closed")
                        self.call_log.status = CallStatus.FAILED
                    self._stream_active = False
                    if not gemini_task.done():
                        gemini_task.cancel()
                    if not twilio_task.done():
                        close = getattr(self.ws, "close", None)
                        if close:
                            await asyncio.to_thread(close)
                        twilio_task.cancel()
                    await asyncio.gather(twilio_task, send_task, gemini_task, return_exceptions=True)
            except Exception as exc:
                self.app.logger.exception("Voice bridge failed: %s", type(exc).__name__)
                db.session.rollback()
                self._record_error(f"voice_bridge_error:{type(exc).__name__}")
                if self.call_log:
                    self.call_log.status = CallStatus.FAILED
            finally:
                self._stream_active = False
                if twilio_task and not twilio_task.done():
                    close = getattr(self.ws, "close", None)
                    if close:
                        try:
                            await asyncio.to_thread(close)
                        except Exception:
                            pass
                    twilio_task.cancel()
                pending_tasks = [task for task in (twilio_task, send_task, gemini_task) if task and not task.done()]
                for task in pending_tasks:
                    task.cancel()
                if pending_tasks:
                    await asyncio.gather(*pending_tasks, return_exceptions=True)
                self._account_queued_audio(inbound_audio)
                self._finalize_call_log()

    async def _await_start_event(self) -> bool:
        while True:
            raw_message = await asyncio.to_thread(self.ws.receive)
            if raw_message is None:
                return False
            event = self.twilio.decode_event(raw_message)
            if event.get("event") == "connected":
                continue
            if event.get("event") != "start":
                return False
            context = self.twilio.session_from_start(event)
            if not context:
                return False
            self.session, self.business, self.call_log = context
            self._capture_sequence_number(event)
            media_format = ((event.get("start") or {}).get("mediaFormat") or {})
            self.voice_metrics["twilio_media_format"] = {
                "encoding": media_format.get("encoding"),
                "sample_rate": media_format.get("sampleRate"),
                "channels": media_format.get("channels"),
            }
            if media_format and (
                media_format.get("encoding") not in (None, "audio/x-mulaw", "mulaw")
                or media_format.get("sampleRate") not in (None, 8000, "8000")
                or media_format.get("channels") not in (None, 1, "1")
            ):
                self._record_error("unsupported_twilio_audio_format")
                self.call_log.status = CallStatus.FAILED
                return False
            return True

    async def _receive_twilio(self, queue: asyncio.Queue[InboundAudioFrame | None]) -> None:
        try:
            while self._stream_active:
                raw_message = await asyncio.to_thread(self.ws.receive)
                if raw_message is None:
                    break
                event = self.twilio.decode_event(raw_message)
                self.voice_metrics["twilio_messages"] += 1
                self._capture_sequence_number(event)
                event_type = event.get("event")
                if event_type == "media":
                    if event.get("streamSid") != self.session.stream_sid:
                        continue
                    media = event.get("media") or {}
                    if media.get("track") not in (None, "inbound"):
                        continue
                    try:
                        pcm = self.audio.twilio_payload_to_gemini_pcm(media.get("payload") or "")
                    except (binascii.Error, ValueError):
                        self.voice_metrics["malformed_media_frames"] = self.voice_metrics.get("malformed_media_frames", 0) + 1
                        self._record_error("invalid_twilio_media")
                        continue
                    if not pcm:
                        continue
                    duration_ms = len(pcm) / 32
                    self._capture_media_metadata(media, duration_ms)
                    self.voice_metrics["media_frames_received"] += 1
                    self.voice_metrics["audio_received_ms"] += duration_ms
                    frame = InboundAudioFrame(pcm, time.monotonic(), duration_ms)
                    if queue.full():
                        try:
                            dropped = queue.get_nowait()
                        except asyncio.QueueEmpty:
                            dropped = None
                        if dropped is not None:
                            self._record_dropped_frame(dropped)
                        self._record_error("inbound_audio_backpressure")
                    queue.put_nowait(frame)
                    self.voice_metrics["queue_high_water_chunks"] = max(
                        self.voice_metrics["queue_high_water_chunks"], queue.qsize()
                    )
                elif event_type == "mark":
                    mark_name = str((event.get("mark") or {}).get("name") or "")
                    self.session.pending_marks.discard(mark_name)
                    if not self.session.pending_marks:
                        self.session.response_playing = False
                        if self.session.hangup_after_response:
                            await self._hangup_after_response()
                            break
                elif event_type == "stop":
                    break
        finally:
            self._stream_active = False
            try:
                queue.put_nowait(None)
            except asyncio.QueueFull:
                try:
                    dropped = queue.get_nowait()
                except asyncio.QueueEmpty:
                    dropped = None
                if dropped is not None:
                    self._record_dropped_frame(dropped)
                queue.put_nowait(None)

    async def _hangup_after_response(self) -> None:
        if not self.session or not self.session.hangup_after_response:
            return
        self.session.hangup_after_response = False
        try:
            await asyncio.to_thread(
                self.twilio.hangup_call,
                call_sid=self.session.call_sid,
            )
        except Exception as exc:
            self._record_error(f"hangup_after_order_error:{type(exc).__name__}")
            self.app.logger.exception("Could not hang up after order confirmation")
        finally:
            self._stream_active = False

    async def _send_audio_to_gemini(self, provider, gemini_session, queue) -> None:
        while True:
            frame = await queue.get()
            if frame is None:
                return
            queue_wait_ms = max(0.0, (time.monotonic() - frame.received_monotonic) * 1000)
            started = time.monotonic()
            await provider.send_audio(gemini_session, frame.pcm)
            send_ms = (time.monotonic() - started) * 1000
            self.voice_metrics["media_frames_sent_to_gemini"] += 1
            self.voice_metrics["audio_sent_ms"] += frame.duration_ms
            self.voice_metrics["queue_wait_ms_total"] += queue_wait_ms
            self.voice_metrics["queue_wait_ms_max"] = max(
                self.voice_metrics["queue_wait_ms_max"], queue_wait_ms
            )
            self.voice_metrics["gemini_send_ms_total"] += send_ms
            self.voice_metrics["gemini_send_ms_max"] = max(
                self.voice_metrics["gemini_send_ms_max"], send_ms
            )

    async def _receive_gemini(self, provider, gemini_session, tools) -> None:
        async for event in provider.events(gemini_session):
            if event.kind == "input_transcript":
                raw_text = str(event.value or "")
                self._input_transcript_events.append(raw_text)
                self._store_transcript_event(
                    event.kind, speaker="caller", raw_text=raw_text,
                    details=event.details, received_at=event.received_at,
                )
            elif event.kind == "input_transcript_interim":
                self._store_transcript_event(
                    event.kind, speaker="caller", raw_text=str(event.value or ""),
                    details=event.details, received_at=event.received_at,
                )
            elif event.kind == "output_transcript":
                raw_text = str(event.value or "")
                self._output_transcript_events.append(raw_text)
                self._store_transcript_event(
                    event.kind, speaker="assistant", raw_text=raw_text,
                    details=event.details, received_at=event.received_at,
                )
            elif event.kind == "audio":
                self._flush_customer_transcript()
                audio_data = event.value
                if isinstance(audio_data, str):
                    audio_data = base64.b64decode(audio_data)
                for chunk in self.audio.gemini_pcm_to_twilio_chunks(audio_data):
                    await self.twilio.send_media(chunk, self.session.stream_sid)
                self._turn_had_audio = True
                self.session.response_playing = True
            elif event.kind == "interrupted":
                self._store_transcript_event(event.kind, details=event.details, received_at=event.received_at)
                await self._handle_interruption()
            elif event.kind == "tool_call":
                self._store_transcript_event(
                    event.kind,
                    details={"count": len(event.value or []), "names": [getattr(call, "name", "") for call in (event.value or [])][:10]},
                    received_at=event.received_at,
                )
                self._flush_customer_transcript()
                await self._handle_tool_call(gemini_session, tools, event.value)
            elif event.kind in {"go_away", "session_resumption_update", "tool_call_cancellation"}:
                self._store_transcript_event(event.kind, details=event.details, received_at=event.received_at)
                if event.kind == "go_away":
                    self.voice_metrics["gemini_go_away_count"] = self.voice_metrics.get("gemini_go_away_count", 0) + 1
                elif event.kind == "tool_call_cancellation":
                    self.voice_metrics["tool_call_cancellation_count"] = self.voice_metrics.get("tool_call_cancellation_count", 0) + 1
                    self._record_error("gemini_tool_call_cancelled")
                else:
                    self.voice_metrics["session_resumption_updates"] = self.voice_metrics.get("session_resumption_updates", 0) + 1
            elif event.kind == "turn_complete":
                self._store_transcript_event(event.kind, details=event.details, received_at=event.received_at)
                await self._complete_turn()

    async def _handle_interruption(self) -> None:
        interrupted_text = _join_transcript_pieces(self._output_transcript_events).strip()
        if interrupted_text:
            self._conversation_lines.append(f"Asistente (interrumpido): {interrupted_text}")
        self._output_transcript_events = []
        self.audio.reset_output()
        self.session.pending_marks.clear()
        self.session.response_playing = False
        self._turn_had_audio = False
        await self.twilio.send_clear(self.session.stream_sid)

    async def _complete_turn(self) -> None:
        self._flush_customer_transcript()
        for chunk in self.audio.flush_twilio_output():
            await self.twilio.send_media(chunk, self.session.stream_sid)
            self._turn_had_audio = True

        assistant_text = _join_transcript_pieces(self._output_transcript_events).strip()
        if assistant_text:
            self._assistant_turns.append(assistant_text)
            self._conversation_lines.append(f"Asistente: {assistant_text}")
        self._output_transcript_events = []

        if self._turn_had_audio:
            self._mark_counter += 1
            mark_name = f"turn-{self._mark_counter}"
            self.session.pending_marks.add(mark_name)
            await self.twilio.send_mark(mark_name, self.session.stream_sid)
        self._turn_had_audio = False
        self._persist_conversation_snapshot()
        self._save_voice_metrics()
        db.session.commit()
        self._pending_transcript_events = 0
        if self.session.hangup_after_response and not self.session.pending_marks:
            await self._hangup_after_response()

    async def _handle_tool_call(self, gemini_session, tools, function_calls) -> None:
        from google.genai import types

        function_responses = []
        for call in function_calls:
            arguments = dict(call.args or {})
            try:
                result = tools.execute(call.name, arguments)
                record_voice_tool_call(self.call_log, call.name, arguments, result)
                db.session.commit()
            except Exception as exc:
                db.session.rollback()
                self.app.logger.exception("Gemini tool failed: %s", call.name)
                result = {"ok": False, "error": "No se pudo completar esa acción."}
                self._record_error(f"voice_tool_error:{type(exc).__name__}")
                record_voice_tool_call(self.call_log, call.name, arguments, result)
                db.session.commit()
            function_responses.append(
                types.FunctionResponse(
                    id=call.id,
                    name=call.name,
                    response=result,
                )
            )
        await gemini_session.send_tool_response(function_responses=function_responses)

    def _flush_customer_transcript(self) -> None:
        for raw_text in self._input_transcript_events:
            customer_text = " ".join(str(raw_text or "").split()).strip()
            if customer_text:
                # Every final provider event stays visible, including repeated
                # words or identical events; no overlap heuristic deletes them.
                self._conversation_lines.append(f"Cliente: {customer_text}")
        self._input_transcript_events = []

    def _build_call_summary(self) -> str | None:
        if not self._conversation_lines:
            return None
        if self.call_log.resulted_in_order:
            prefix = "Pedido confirmado durante la llamada."
        elif self.session and self.session.transfer_requested:
            prefix = "Llamada transferida a una persona."
        else:
            prefix = "Llamada atendida sin pedido confirmado."
        conversation = " ".join(self._conversation_lines)
        return f"{prefix} {conversation}"[:2000]

    def _persist_conversation_snapshot(self) -> None:
        if not self.call_log:
            return
        if self._conversation_lines:
            self.call_log.transcript = "\n".join(self._conversation_lines)
        self.call_log.ai_summary = self._build_call_summary()

    def _record_error(self, flag: str) -> None:
        if not self.call_log:
            return
        normalized = flag[:120]
        if not any(item.flag == normalized for item in self.call_log.error_flags):
            self.call_log.error_flags.append(CallLogErrorFlag(flag=normalized))

    def _finalize_call_log(self) -> None:
        if not self.call_log:
            return
        self._flush_customer_transcript()
        assistant_text = _join_transcript_pieces(self._output_transcript_events).strip()
        if assistant_text:
            self._assistant_turns.append(assistant_text)
            self._conversation_lines.append(f"Asistente: {assistant_text}")
        self._persist_conversation_snapshot()
        self._save_voice_metrics()

        if self.session and self.session.transfer_requested:
            self.call_log.session_state = "transferred"
        else:
            self.call_log.session_state = "ended"
            if not self.call_log.end_time:
                self.call_log.end_time = _now_utc()
            if self.call_log.start_time and self.call_log.end_time:
                self.call_log.duration_seconds = max(
                    int((self.call_log.end_time - self.call_log.start_time).total_seconds()),
                    0,
                )
            if self.call_log.status == CallStatus.INCOMPLETE:
                self.call_log.status = CallStatus.COMPLETED

        linked_order = Order.query.filter_by(call_log_id=self.call_log.id).first()
        if linked_order and self.call_log.transcript:
            linked_order.transcript_preview = self.call_log.transcript[-2000:]
            linked_order.ai_call_summary = self.call_log.ai_summary
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            self.app.logger.exception("Could not finalize voice call log")


def inbound_twilio_call() -> Response:
    runtime = VoiceRuntimeConfig.from_app_config(current_app.config)
    adapter = TwilioVoiceAdapter(
        runtime=runtime,
        secret_key=current_app.config["SECRET_KEY"],
    )
    form_data = request.form.to_dict(flat=True)
    if not adapter.validate_request(
        url=request.url,
        params=form_data,
        signature=request.headers.get("X-Twilio-Signature", ""),
    ):
        return Response("Invalid Twilio signature", status=403)

    business = adapter.resolve_business(form_data.get("To"))
    if (
        not business
        or (business.settings and not business.settings.voice_enabled)
        or not runtime.twilio_ready
        or not runtime.gemini_ready
        or not runtime.twilio_stream_url.startswith("wss://")
    ):
        return Response(adapter.reject_twiml(), mimetype="text/xml")

    call_log = get_or_create_call_log(
        business=business,
        caller_phone=form_data.get("From"),
        to_number=form_data.get("To"),
        call_sid=form_data.get("CallSid"),
    )
    return Response(adapter.build_stream_twiml(call_log), mimetype="text/xml")


def update_call_status_from_twilio() -> tuple[dict[str, Any], int]:
    runtime = VoiceRuntimeConfig.from_app_config(current_app.config)
    adapter = TwilioVoiceAdapter(
        runtime=runtime,
        secret_key=current_app.config["SECRET_KEY"],
    )
    form_data = request.form.to_dict(flat=True)
    if not adapter.validate_request(
        url=request.url,
        params=form_data,
        signature=request.headers.get("X-Twilio-Signature", ""),
    ):
        return {"updated": False, "reason": "invalid_signature"}, 403

    call_sid = form_data.get("CallSid")
    if not call_sid:
        return {"updated": False, "reason": "missing_call_sid"}, 400
    item = CallLog.query.filter_by(provider_call_sid=call_sid).first()
    if not item:
        return {"updated": False, "reason": "call_log_not_found"}, 404

    provider_status = map_twilio_call_status(form_data.get("CallStatus"))
    # A completed telephone leg does not erase a failure in the Gemini bridge.
    if not (item.status == CallStatus.FAILED and provider_status == CallStatus.COMPLETED):
        item.status = provider_status
    if form_data.get("CallDuration"):
        try:
            item.duration_seconds = int(form_data["CallDuration"])
        except ValueError:
            pass
    if item.status in {CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.DROPPED}:
        item.end_time = _now_utc()
        item.session_state = "ended"
    db.session.commit()
    return {"updated": True, "call_log_id": item.id}, 200
