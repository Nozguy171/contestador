from __future__ import annotations

import asyncio
import base64
import json
from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from twilio.request_validator import RequestValidator
from twilio.rest import Client
from twilio.twiml.voice_response import Connect, Stream, VoiceResponse

from app.extensions import db
from app.models import Business, CallLog
from app.services.call_session import CallSession
from app.services.voice_runtime import VoiceRuntimeConfig
from app.utils.phone import normalize_phone_number


class TwilioVoiceAdapter:
    TOKEN_SALT = "twilio-media-stream"

    def __init__(self, *, runtime: VoiceRuntimeConfig, secret_key: str, ws: Any = None) -> None:
        self.runtime = runtime
        self.ws = ws
        self._tokens = URLSafeTimedSerializer(secret_key, salt=self.TOKEN_SALT)

    def validate_request(self, *, url: str, params: dict[str, Any], signature: str) -> bool:
        if not self.runtime.twilio_validate_signature:
            return True
        return RequestValidator(self.runtime.twilio_auth_token).validate(url, params, signature)

    def validate_websocket(self) -> bool:
        if not self.runtime.twilio_validate_signature:
            return True
        environ = getattr(self.ws, "environ", {}) or {}
        signature = (
            environ.get("HTTP_X_TWILIO_SIGNATURE")
            or environ.get("x-twilio-signature")
            or environ.get("X-Twilio-Signature")
            or ""
        )
        return RequestValidator(self.runtime.twilio_auth_token).validate(
            self.runtime.twilio_stream_url,
            {},
            signature,
        )

    @staticmethod
    def resolve_business(to_number: str | None) -> Business | None:
        normalized_to = normalize_phone_number(to_number)
        if not normalized_to:
            return None
        exact = Business.query.filter_by(twilio_phone_number=normalized_to).first()
        if exact:
            return exact
        return next(
            (
                business
                for business in Business.query.filter(Business.twilio_phone_number.isnot(None)).all()
                if normalize_phone_number(business.twilio_phone_number) == normalized_to
            ),
            None,
        )

    def build_stream_token(self, call_log: CallLog) -> str:
        return self._tokens.dumps(
            {
                "call_log_id": call_log.id,
                "call_sid": call_log.provider_call_sid,
                "to_number": call_log.to_number,
            }
        )

    def build_stream_twiml(self, call_log: CallLog) -> str:
        response = VoiceResponse()
        connect = Connect()
        stream = Stream(url=self.runtime.twilio_stream_url)
        stream.parameter(name="session_token", value=self.build_stream_token(call_log))
        connect.append(stream)
        response.append(connect)
        return str(response)

    @staticmethod
    def reject_twiml() -> str:
        response = VoiceResponse()
        response.reject(reason="busy")
        return str(response)

    @staticmethod
    def decode_event(raw_message: str) -> dict[str, Any]:
        return json.loads(raw_message)

    def session_from_start(self, event: dict[str, Any]) -> tuple[CallSession, Business, CallLog] | None:
        start = event.get("start") or {}
        params = start.get("customParameters") or {}
        token = params.get("session_token")
        if not token:
            return None
        try:
            token_data = self._tokens.loads(
                token,
                max_age=self.runtime.voice_stream_token_ttl_seconds,
            )
        except (BadSignature, SignatureExpired):
            return None

        try:
            call_log_id = int(token_data["call_log_id"])
        except (KeyError, TypeError, ValueError):
            return None
        call_log = db.session.get(CallLog, call_log_id)
        stream_sid = start.get("streamSid") or event.get("streamSid")
        call_sid = start.get("callSid")
        if not call_log or not stream_sid or not call_sid:
            return None
        if token_data.get("call_sid") != call_sid or call_log.provider_call_sid != call_sid:
            return None

        token_to = normalize_phone_number(token_data.get("to_number"))
        if not token_to or token_to != normalize_phone_number(call_log.to_number):
            return None
        business = self.resolve_business(token_to)
        if not business or business.id != call_log.business_id:
            return None

        session = CallSession.from_call_log(
            call_log=call_log,
            stream_sid=stream_sid,
            call_sid=call_sid,
        )
        return session, business, call_log

    async def send_media(self, raw_mulaw: bytes, stream_sid: str) -> None:
        await self._send(
            {
                "event": "media",
                "streamSid": stream_sid,
                "media": {"payload": base64.b64encode(raw_mulaw).decode("ascii")},
            }
        )

    async def send_mark(self, name: str, stream_sid: str) -> None:
        await self._send(
            {"event": "mark", "streamSid": stream_sid, "mark": {"name": name}}
        )

    async def send_clear(self, stream_sid: str) -> None:
        await self._send({"event": "clear", "streamSid": stream_sid})

    async def _send(self, event: dict[str, Any]) -> None:
        await asyncio.to_thread(self.ws.send, json.dumps(event))

    def transfer_to_human(self, *, call_sid: str, phone_number: str) -> None:
        response = VoiceResponse()
        response.dial(phone_number)
        client = Client(self.runtime.twilio_account_sid, self.runtime.twilio_auth_token)
        client.calls(call_sid).update(twiml=str(response))
