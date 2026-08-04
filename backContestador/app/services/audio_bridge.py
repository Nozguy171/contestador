from __future__ import annotations

import audioop
import base64
import sys
from array import array
from math import cos, pi, sin


def _lowpass_coefficients(*, taps: int, cutoff_hz: int, sample_rate: int) -> tuple[float, ...]:
    center = (taps - 1) / 2
    normalized_cutoff = 2 * cutoff_hz / sample_rate
    coefficients = []
    for index in range(taps):
        distance = index - center
        sinc = 1.0 if distance == 0 else sin(pi * normalized_cutoff * distance) / (pi * distance)
        window = 0.54 - 0.46 * cos(2 * pi * index / (taps - 1))
        coefficients.append(sinc * window)
    total = sum(coefficients)
    return tuple(value / total for value in coefficients)


class _PcmDecimator:
    FACTOR = 3
    TAPS = 33
    HALF_TAPS = TAPS // 2
    COEFFICIENTS = _lowpass_coefficients(
        taps=TAPS,
        cutoff_hz=3_600,
        sample_rate=24_000,
    )

    def __init__(self) -> None:
        self._samples = array("h")
        self._base_index = 0
        self._next_center = self.HALF_TAPS

    def add(self, raw_pcm: bytes) -> bytes:
        if raw_pcm:
            samples = array("h")
            samples.frombytes(raw_pcm)
            if sys.byteorder != "little":
                samples.byteswap()
            self._samples.extend(samples)
        return self._drain()

    def flush(self) -> bytes:
        self._samples.extend([0] * (self.TAPS - 1))
        output = self._drain()
        self.reset()
        return output

    def reset(self) -> None:
        self._samples = array("h")
        self._base_index = 0
        self._next_center = self.HALF_TAPS

    def _drain(self) -> bytes:
        last_index = self._base_index + len(self._samples) - 1
        output = array("h")
        while self._next_center + self.HALF_TAPS <= last_index:
            center = self._next_center - self._base_index
            value = sum(
                self._samples[center + offset - self.HALF_TAPS] * coefficient
                for offset, coefficient in enumerate(self.COEFFICIENTS)
            )
            output.append(max(-32768, min(32767, round(value))))
            self._next_center += self.FACTOR

        keep_from = self._next_center - self.HALF_TAPS - self._base_index
        if keep_from > 0:
            del self._samples[:keep_from]
            self._base_index += keep_from

        if sys.byteorder != "little":
            output.byteswap()
        return output.tobytes()


class AudioBridge:
    """Incremental, in-memory conversion between Twilio and Gemini audio."""

    TWILIO_RATE = 8_000
    GEMINI_INPUT_RATE = 16_000
    GEMINI_OUTPUT_RATE = 24_000
    SAMPLE_WIDTH = 2
    TWILIO_CHUNK_BYTES = 160  # 20 ms of mono µ-law at 8 kHz.

    def __init__(self) -> None:
        self._input_rate_state = None
        self._twilio_output_buffer = bytearray()
        self._output_decimator = _PcmDecimator()

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

        pcm_8k = self._output_decimator.add(pcm_24k)
        self._twilio_output_buffer.extend(audioop.lin2ulaw(pcm_8k, self.SAMPLE_WIDTH))

        chunks = []
        while len(self._twilio_output_buffer) >= self.TWILIO_CHUNK_BYTES:
            chunks.append(bytes(self._twilio_output_buffer[: self.TWILIO_CHUNK_BYTES]))
            del self._twilio_output_buffer[: self.TWILIO_CHUNK_BYTES]
        return chunks

    def flush_twilio_output(self) -> list[bytes]:
        pcm_8k = self._output_decimator.flush()
        if pcm_8k:
            self._twilio_output_buffer.extend(audioop.lin2ulaw(pcm_8k, self.SAMPLE_WIDTH))
        if not self._twilio_output_buffer:
            return []
        chunk = bytes(self._twilio_output_buffer)
        self._twilio_output_buffer.clear()
        return [chunk]

    def reset_output(self) -> None:
        self._twilio_output_buffer.clear()
        self._output_decimator.reset()
