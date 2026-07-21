from flask import Blueprint, current_app, g

from app.services.voice_realtime import (
    inbound_twilio_call,
    update_call_status_from_twilio,
)
from app.services.voice_runtime import (
    VoiceRuntimeConfig,
    build_business_voice_context,
    build_gemini_system_prompt,
)
from app.utils.auth import require_business
from app.utils.responses import success

bp = Blueprint("voice", __name__, url_prefix="/api/v1/voice")
public_bp = Blueprint("public_voice", __name__, url_prefix="/voice")


@bp.get("/runtime")
@require_business("manager")
def get_voice_runtime():
    runtime = VoiceRuntimeConfig.from_app_config(current_app.config)
    status = runtime.to_status_payload()
    status["twilio"]["tenant_number_configured"] = bool(g.current_business.twilio_phone_number)
    status["twilio"]["human_transfer_configured"] = bool(g.current_business.human_transfer_number)
    status["ready"] = status["ready"] and status["twilio"]["tenant_number_configured"]
    return success(
        {
            "runtime": status,
            "business_context": build_business_voice_context(g.current_business),
            "gemini_system_prompt_preview": build_gemini_system_prompt(g.current_business),
        }
    )


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

