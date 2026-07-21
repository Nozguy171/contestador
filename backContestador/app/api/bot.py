from flask import Blueprint, g, request

from app.extensions import db
from app.models import BotConfig
from app.models.enums import BotTone, UnavailableBehavior
from app.utils.auth import require_business
from app.utils.responses import success

bp = Blueprint("bot", __name__, url_prefix="/api/v1/businesses/current/bot-config")


@bp.get("")
@require_business()
def get_bot_config():
    config = g.current_business.bot_config or BotConfig(business_id=g.current_business.id)
    if not config.id:
        db.session.add(config)
        db.session.commit()
    return success(config.to_dict())


@bp.put("")
@require_business("manager")
def upsert_bot_config():
    data = request.get_json(silent=True) or {}
    config = g.current_business.bot_config
    if not config:
        config = BotConfig(business_id=g.current_business.id)
        db.session.add(config)

    for field in [
        "welcome_message",
        "after_hours_message",
        "fallback_message",
        "confirmation_required",
        "retry_count",
        "unavailable_behavior",
        "can_suggest_alternatives",
        "tone",
        "special_instructions",
    ]:
        if field in data:
            value = data[field]
            if field == "tone":
                value = BotTone(value)
            if field == "unavailable_behavior":
                value = UnavailableBehavior(value)
            setattr(config, field, value)

    db.session.commit()
    return success(config.to_dict(), "Bot config updated")
