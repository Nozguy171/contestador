from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from google import genai
from google.genai import types

from app.services.voice_runtime import VoiceRuntimeConfig


@dataclass(frozen=True)
class GeminiLiveEvent:
    kind: str
    value: Any = None
    details: dict[str, Any] = field(default_factory=dict)
    received_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class GeminiLiveProvider:
    def __init__(
        self,
        *,
        runtime: VoiceRuntimeConfig,
        system_prompt: str,
        function_declarations: list[dict[str, Any]],
    ) -> None:
        self.runtime = runtime
        self.system_prompt = system_prompt
        self.function_declarations = function_declarations
        self.resumption_handle: str | None = None

    def _config(self) -> dict[str, Any]:
        config: dict[str, Any] = {
            "response_modalities": ["AUDIO"],
            "system_instruction": self.system_prompt,
            "speech_config": {
                "language_code": self.runtime.gemini_language_code,
                "voice_config": {
                    "prebuilt_voice_config": {"voice_name": self.runtime.gemini_voice_name}
                },
            },
            "input_audio_transcription": {},
            "output_audio_transcription": {},
            "realtime_input_config": {
                "automatic_activity_detection": {
                    "disabled": False,
                    "start_of_speech_sensitivity": self.runtime.voice_start_of_speech_sensitivity,
                    "end_of_speech_sensitivity": self.runtime.voice_end_of_speech_sensitivity,
                    "prefix_padding_ms": self.runtime.voice_prefix_padding_ms,
                    "silence_duration_ms": self.runtime.voice_silence_duration_ms,
                },
                "activity_handling": "START_OF_ACTIVITY_INTERRUPTS",
            },
            "tools": [{
                "function_declarations": [
                    {**declaration, "behavior": "BLOCKING"}
                    for declaration in self.function_declarations
                ]
            }],
            "context_window_compression": {"sliding_window": {}},
            "session_resumption": (
                {"handle": self.resumption_handle}
                if self.resumption_handle
                else {}
            ),
        }
        if self.runtime.gemini_model.startswith("gemini-3.1"):
            # Low gives the live model a little more room to resolve quantities,
            # addresses, and tool order without the latency of medium/high.
            config["thinking_config"] = {"thinking_level": "low"}
        return config

    @asynccontextmanager
    async def connect(self) -> AsyncIterator[Any]:
        client = genai.Client(
            api_key=self.runtime.gemini_api_key,
            http_options={"api_version": self.runtime.gemini_http_api_version},
        )
        try:
            async with client.aio.live.connect(
                model=self.runtime.gemini_model,
                config=self._config(),
            ) as session:
                yield session
        finally:
            await client.aio.aclose()

    async def send_audio(self, session: Any, pcm_16k: bytes) -> None:
        await session.send_realtime_input(
            audio=types.Blob(data=pcm_16k, mime_type="audio/pcm;rate=16000")
        )

    async def start_greeting(self, session: Any, welcome_message: str) -> None:
        instruction = (
            "La llamada acaba de conectarse. Saluda ahora al cliente en voz alta y abre la conversación. "
            f"Usa este mensaje como base: {welcome_message}"
        )
        await session.send_client_content(
            turns={"role": "user", "parts": [{"text": instruction}]},
            turn_complete=True,
        )

    async def events(self, session: Any) -> AsyncIterator[GeminiLiveEvent]:
        while True:
            async for response in session.receive():
                if response.tool_call:
                    yield GeminiLiveEvent("tool_call", response.tool_call.function_calls)
                cancellation = getattr(response, "tool_call_cancellation", None)
                if cancellation:
                    yield GeminiLiveEvent(
                        "tool_call_cancellation",
                        details={"ids": list(getattr(cancellation, "ids", []) or [])[:20]},
                    )
                go_away = getattr(response, "go_away", None)
                if go_away:
                    yield GeminiLiveEvent(
                        "go_away",
                        details={"time_left": str(getattr(go_away, "time_left", "") or "")[:40]},
                    )
                resumption = getattr(response, "session_resumption_update", None)
                if resumption:
                    new_handle = getattr(resumption, "new_handle", None)
                    resumable = bool(getattr(resumption, "resumable", False) and new_handle)
                    if resumable:
                        self.resumption_handle = str(new_handle)
                    yield GeminiLiveEvent(
                        "session_resumption_update",
                        details={"resumable": resumable, "handle_saved": resumable},
                    )

                server_content = getattr(response, "server_content", None)
                if not server_content:
                    continue
                if getattr(server_content, "interrupted", False):
                    yield GeminiLiveEvent("interrupted")

                input_transcription = getattr(server_content, "input_transcription", None)
                if input_transcription and input_transcription.text:
                    yield GeminiLiveEvent(
                        "input_transcript",
                        input_transcription.text,
                        details={"finality": "final"},
                    )

                interim_transcription = getattr(server_content, "interim_input_transcription", None)
                if interim_transcription and interim_transcription.text:
                    yield GeminiLiveEvent(
                        "input_transcript_interim",
                        interim_transcription.text,
                        details={"finality": "interim"},
                    )

                output_transcription = getattr(server_content, "output_transcription", None)
                if output_transcription and output_transcription.text:
                    yield GeminiLiveEvent(
                        "output_transcript",
                        output_transcription.text,
                        details={"finality": "final"},
                    )

                model_turn = getattr(server_content, "model_turn", None)
                if model_turn:
                    for part in model_turn.parts:
                        inline_data = getattr(part, "inline_data", None)
                        if inline_data and inline_data.data:
                            yield GeminiLiveEvent("audio", inline_data.data)

                if getattr(server_content, "turn_complete", False):
                    yield GeminiLiveEvent("turn_complete")
