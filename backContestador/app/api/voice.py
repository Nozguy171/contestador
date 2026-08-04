import base64
import binascii
import io
import json
import urllib.error
import urllib.request
import wave

from flask import Blueprint, Response, current_app, g, request

from app.services.voice_realtime import (
    inbound_twilio_call,
    update_call_status_from_twilio,
)
from app.services.voice_runtime import (
    GEMINI_VOICE_NAMES,
    VoiceRuntimeConfig,
    build_business_voice_context,
    build_gemini_system_prompt,
)
from app.utils.auth import require_business
from app.utils.responses import error, success

bp = Blueprint("voice", __name__, url_prefix="/api/v1/voice")
public_bp = Blueprint("public_voice", __name__, url_prefix="/voice")


@bp.get("/runtime")
@require_business("manager")
def get_voice_runtime():
    runtime = VoiceRuntimeConfig.from_app_config(current_app.config, business=g.current_business)
    status = runtime.to_status_payload()
    status["twilio"]["tenant_number_configured"] = bool(g.current_business.twilio_phone_number)
    status["twilio"]["human_transfer_configured"] = bool(g.current_business.human_transfer_number)
    voice_enabled = not g.current_business.settings or g.current_business.settings.voice_enabled
    status["voice_enabled"] = voice_enabled
    status["ready"] = status["ready"] and status["twilio"]["tenant_number_configured"] and voice_enabled
    return success(
        {
            "runtime": status,
            "business_context": build_business_voice_context(g.current_business),
            "gemini_system_prompt_preview": build_gemini_system_prompt(g.current_business),
        }
    )


@bp.post("/preview")
@require_business("manager")
def preview_voice():
    data = request.get_json(silent=True) or {}
    voice_name = str(data.get("voice_name") or "").strip()
    if voice_name not in GEMINI_VOICE_NAMES:
        return error("La voz seleccionada no es válida.", 400)

    api_key = current_app.config.get("GEMINI_API_KEY", "")
    if not api_key:
        return error("GEMINI_API_KEY no está configurada.", 503)

    business_name = g.current_business.name
    payload = {
        "contents": [{
            "parts": [{
                "text": (
                    f"Di con voz clara y natural en español: Hola, gracias por llamar a {business_name}. "
                    "¿En qué te puedo ayudar hoy?"
                )
            }]
        }],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {"voiceName": voice_name}
                }
            },
        },
    }
    request_data = json.dumps(payload).encode("utf-8")
    http_request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent",
        data=request_data,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(http_request, timeout=30) as response:
            response_data = json.loads(response.read())
        encoded_audio = (
            response_data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
        )
        pcm = base64.b64decode(encoded_audio, validate=True)
    except (
        urllib.error.HTTPError,
        urllib.error.URLError,
        binascii.Error,
        KeyError,
        IndexError,
        ValueError,
    ) as exc:
        current_app.logger.warning("Voice preview failed: %s", type(exc).__name__)
        return error("No se pudo generar el preview de voz.", 502)

    audio = io.BytesIO()
    with wave.open(audio, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(24_000)
        wav_file.writeframes(pcm)
    return Response(audio.getvalue(), mimetype="audio/wav", headers={"Cache-Control": "no-store"})


@bp.post("/incoming")
@bp.post("/twilio/inbound")
def twilio_inbound():
    return inbound_twilio_call()


@public_bp.post("/incoming")
def public_twilio_inbound():
    return inbound_twilio_call()


@bp.post("/twilio/status")
def twilio_status():
    payload, status = update_call_status_from_twilio()
    return success(payload, status=status)
