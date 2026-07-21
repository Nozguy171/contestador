import asyncio

from app.extensions import sock
from app.services.voice_realtime import TwilioGeminiBridge


def register_voice_socket(app):
    path = app.config.get("VOICE_STREAM_PATH", "/api/v1/voice/twilio/media-stream")

    @sock.route(path)
    def twilio_media_stream(ws):
        bridge = TwilioGeminiBridge(ws, app)
        asyncio.run(bridge.run())
