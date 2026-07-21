from __future__ import annotations

import audioop
import base64


class AudioBridge:
    """Incremental, in-memory conversion between Twilio and Gemini audio."""

    TWILIO_RATE = 8_000
    GEMINI_INPUT_RATE = 16_000
    GEMINI_OUTPUT_RATE = 24_000
    SAMPLE_WIDTH = 2
    TWILIO_CHUNK_BYTES = 160  # 20 ms of mono µ-law at 8 kHz.

    def __init__(self) -> None:
        self._input_rate_state = None
        self._output_rate_state = None
        self._twilio_output_buffer = bytearray()

    def twilio_payload_to_gemini_pcm(self, payload: str) -> bytes:
        mulaw = base64.b64decode(payload, validate=True)
        pcm_8k = audioop.ulaw2lin(mulaw, self.SAMPLE_WIDTH)
        pcm_16k, self._input_rate_state = audioop.ratecv(
            pcm_8k,
            self.SAMPLE_WIDTH,
            1,
            self.TWILIO_RATE,
            self.GEMINI_INPUT_RATE,
            self._input_rate_state,
        )
        return pcm_16k

    def gemini_pcm_to_twilio_chunks(self, pcm_24k: bytes) -> list[bytes]:
        if not pcm_24k:
            return []
        if len(pcm_24k) % self.SAMPLE_WIDTH:
            pcm_24k = pcm_24k[:-1]
        if not pcm_24k:
            return []

        pcm_8k, self._output_rate_state = audioop.ratecv(
            pcm_24k,
            self.SAMPLE_WIDTH,
            1,
            self.GEMINI_OUTPUT_RATE,
            self.TWILIO_RATE,
            self._output_rate_state,
        )
        self._twilio_output_buffer.extend(audioop.lin2ulaw(pcm_8k, self.SAMPLE_WIDTH))

        chunks = []
        while len(self._twilio_output_buffer) >= self.TWILIO_CHUNK_BYTES:
            chunks.append(bytes(self._twilio_output_buffer[: self.TWILIO_CHUNK_BYTES]))
            del self._twilio_output_buffer[: self.TWILIO_CHUNK_BYTES]
        return chunks

    def flush_twilio_output(self) -> list[bytes]:
        if not self._twilio_output_buffer:
            return []
        chunk = bytes(self._twilio_output_buffer)
        self._twilio_output_buffer.clear()
        return [chunk]

    def reset_output(self) -> None:
        self._output_rate_state = None
        self._twilio_output_buffer.clear()
