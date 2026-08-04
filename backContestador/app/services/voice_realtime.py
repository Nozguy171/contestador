from __future__ import annotations

import asyncio
import base64
import binascii
from datetime import datetime, timezone
from typing import Any

from flask import Response, current_app, request

from app.extensions import db
from app.models import CallLog, CallLogErrorFlag, Order
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
    AUDIO_QUEUE_CHUNKS = 10

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
        self._input_transcript_chunks: list[str] = []
        self._output_transcript_chunks: list[str] = []
        self._assistant_turns: list[str] = []
        self._turn_had_audio = False
        self._mark_counter = 0

    async def run(self) -> None:
        with self.app.app_context():
            try:
                if not self.twilio.validate_websocket():
                    self.app.logger.warning("Rejected Media Stream with invalid Twilio signature")
                    return
                if not await self._await_start_event():
                    self.app.logger.warning("Rejected Media Stream with invalid start context")
                    return

                self.call_log.provider_stream_sid = self.session.stream_sid
                self.call_log.session_state = "active"
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
                inbound_audio: asyncio.Queue[bytes | None] = asyncio.Queue(
                    maxsize=self.AUDIO_QUEUE_CHUNKS
                )

                async with provider.connect() as gemini_session:
                    welcome = (
                        self.business.bot_config.welcome_message
                        if self.business.bot_config and self.business.bot_config.welcome_message
                        else f"Gracias por llamar a {self.business.name}. ¿En qué te puedo ayudar?"
                    )
                    await provider.start_greeting(gemini_session, welcome)
                    tasks = {
                        asyncio.create_task(self._receive_twilio(inbound_audio)),
                        asyncio.create_task(
                            self._send_audio_to_gemini(provider, gemini_session, inbound_audio)
                        ),
                        asyncio.create_task(
                            self._receive_gemini(provider, gemini_session, tools)
                        ),
                    }
                    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    self._stream_active = False
                    for task in pending:
                        task.cancel()
                    close = getattr(self.ws, "close", None)
                    if close:
                        await asyncio.to_thread(close)
                    await asyncio.gather(*pending, return_exceptions=True)
                    results = await asyncio.gather(*done, return_exceptions=True)
                    for result in results:
                        if isinstance(result, Exception) and not isinstance(
                            result, asyncio.CancelledError
                        ):
                            raise result
            except Exception as exc:
                self.app.logger.exception("Voice bridge failed: %s", type(exc).__name__)
                db.session.rollback()
                self._record_error(f"voice_bridge_error:{type(exc).__name__}")
                if self.call_log:
                    self.call_log.status = CallStatus.FAILED
            finally:
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
            return True

    async def _receive_twilio(self, queue: asyncio.Queue[bytes | None]) -> None:
        while self._stream_active:
            raw_message = await asyncio.to_thread(self.ws.receive)
            if raw_message is None:
                break
            event = self.twilio.decode_event(raw_message)
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
                    self._record_error("invalid_twilio_media")
                    continue
                if not pcm:
                    continue
                if queue.full():
                    try:
                        queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                    self._record_error("inbound_audio_backpressure")
                queue.put_nowait(pcm)
            elif event_type == "mark":
                mark_name = str((event.get("mark") or {}).get("name") or "")
                self.session.pending_marks.discard(mark_name)
                if not self.session.pending_marks:
                    self.session.response_playing = False
            elif event_type == "stop":
                break

        self._stream_active = False
        try:
            queue.put_nowait(None)
        except asyncio.QueueFull:
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            queue.put_nowait(None)

    async def _send_audio_to_gemini(self, provider, gemini_session, queue) -> None:
        while self._stream_active:
            pcm = await queue.get()
            if pcm is None:
                return
            await provider.send_audio(gemini_session, pcm)

    async def _receive_gemini(self, provider, gemini_session, tools) -> None:
        async for event in provider.events(gemini_session):
            if event.kind == "input_transcript":
                self._input_transcript_chunks.append(str(event.value))
            elif event.kind == "output_transcript":
                self._output_transcript_chunks.append(str(event.value))
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
                await self._handle_interruption()
            elif event.kind == "tool_call":
                self._flush_customer_transcript()
                await self._handle_tool_call(gemini_session, tools, event.value)
            elif event.kind == "turn_complete":
                await self._complete_turn()

    async def _handle_interruption(self) -> None:
        interrupted_text = "".join(self._output_transcript_chunks).strip()
        if interrupted_text:
            self._conversation_lines.append(f"Asistente (interrumpido): {interrupted_text}")
        self._output_transcript_chunks.clear()
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

        assistant_text = "".join(self._output_transcript_chunks).strip()
        if assistant_text:
            self._assistant_turns.append(assistant_text)
            self._conversation_lines.append(f"Asistente: {assistant_text}")
        self._output_transcript_chunks.clear()

        if self._turn_had_audio:
            self._mark_counter += 1
            mark_name = f"turn-{self._mark_counter}"
            self.session.pending_marks.add(mark_name)
            await self.twilio.send_mark(mark_name, self.session.stream_sid)
        self._turn_had_audio = False
        self._persist_conversation_snapshot()
        db.session.commit()

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
        customer_text = "".join(self._input_transcript_chunks).strip()
        if customer_text:
            self._conversation_lines.append(f"Cliente: {customer_text}")
        self._input_transcript_chunks.clear()

    def _persist_conversation_snapshot(self) -> None:
        if not self.call_log:
            return
        if self._conversation_lines:
            self.call_log.transcript = "\n".join(self._conversation_lines)
        if self._assistant_turns:
            self.call_log.ai_summary = self._assistant_turns[-1]

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
        assistant_text = "".join(self._output_transcript_chunks).strip()
        if assistant_text:
            self._assistant_turns.append(assistant_text)
            self._conversation_lines.append(f"Asistente: {assistant_text}")
        self._persist_conversation_snapshot()

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

    item.status = map_twilio_call_status(form_data.get("CallStatus"))
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
