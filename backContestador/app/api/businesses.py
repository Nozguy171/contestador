from datetime import datetime, time

from flask import Blueprint, g, request

from app.extensions import db
from app.models import (
    Business,
    BusinessDeliveryZone,
    BusinessHour,
    BusinessPolicy,
    BusinessPromotion,
    BusinessSetting,
    BusinessUser,
    FAQ,
)
from app.models.enums import BusinessRole
from app.utils.auth import require_auth, require_business
from app.utils.phone import normalize_phone_number
from app.utils.responses import error, success

bp = Blueprint("businesses", __name__, url_prefix="/api/v1/businesses")


def _parse_time(raw_value):
    if raw_value in (None, ""):
        return None
    return time.fromisoformat(raw_value)


def _e164_or_none(raw_value, label):
    if raw_value in (None, ""):
        return None
    normalized = normalize_phone_number(str(raw_value))
    digits = (normalized or "").removeprefix("+")
    if not normalized or not normalized.startswith("+") or not digits.isdigit() or not 8 <= len(digits) <= 15:
        raise ValueError(f"{label} must use E.164 format, for example +526641234567")
    return normalized


def _twilio_number_is_available(phone_number, business_id=None):
    if not phone_number:
        return True
    candidates = Business.query.filter(Business.twilio_phone_number.isnot(None))
    if business_id is not None:
        candidates = candidates.filter(Business.id != business_id)
    return not any(
        normalize_phone_number(item.twilio_phone_number) == phone_number
        for item in candidates.all()
    )


@bp.get("")
@require_auth
def list_businesses():
    businesses = []
    for membership in g.current_user.memberships:
        item = membership.business.to_dict()
        item["role"] = membership.role.value
        businesses.append(item)
    return success(businesses)


@bp.post("")
@require_auth
def create_business():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return error("name is required", 400)
    try:
        twilio_phone_number = _e164_or_none(data.get("twilio_phone_number"), "twilio_phone_number")
        human_transfer_number = _e164_or_none(
            data.get("human_transfer_number"), "human_transfer_number"
        )
    except ValueError as exc:
        return error(str(exc), 400)
    if not _twilio_number_is_available(twilio_phone_number):
        return error("twilio_phone_number is already assigned to another business", 409)
    if twilio_phone_number and human_transfer_number == twilio_phone_number:
        return error("human_transfer_number must differ from twilio_phone_number", 400)

    business = Business(
        name=name,
        address=data.get("address"),
        phone=data.get("phone"),
        twilio_phone_number=twilio_phone_number,
        human_transfer_number=human_transfer_number,
        email=data.get("email"),
        estimated_delivery_time=data.get("estimated_delivery_time"),
    )
    business.settings = BusinessSetting()
    db.session.add(business)
    db.session.flush()

    membership = BusinessUser(
        business_id=business.id,
        user_id=g.current_user.id,
        role=BusinessRole.OWNER,
    )
    db.session.add(membership)
    db.session.commit()

    return success({"business": business.to_dict(), "role": membership.role.value}, "Business created", 201)


@bp.get("/current")
@require_business()
def get_current_business():
    business = g.current_business
    data = business.to_dict()
    data["role"] = g.current_membership.role.value
    return success(data)


@bp.put("/current")
@require_business("manager")
def update_current_business():
    data = request.get_json(silent=True) or {}
    business = g.current_business

    try:
        next_twilio = (
            _e164_or_none(data.get("twilio_phone_number"), "twilio_phone_number")
            if "twilio_phone_number" in data
            else business.twilio_phone_number
        )
        next_human = (
            _e164_or_none(data.get("human_transfer_number"), "human_transfer_number")
            if "human_transfer_number" in data
            else business.human_transfer_number
        )
    except ValueError as exc:
        return error(str(exc), 400)
    if not _twilio_number_is_available(next_twilio, business.id):
        return error("twilio_phone_number is already assigned to another business", 409)
    if next_twilio and normalize_phone_number(next_human) == normalize_phone_number(next_twilio):
        return error("human_transfer_number must differ from twilio_phone_number", 400)

    for field in [
        "name",
        "address",
        "phone",
        "twilio_phone_number",
        "human_transfer_number",
        "email",
        "estimated_delivery_time",
    ]:
        if field in data:
            value = data[field]
            if field == "twilio_phone_number":
                value = next_twilio
            elif field == "human_transfer_number":
                value = next_human
            setattr(business, field, value)

    db.session.commit()
    return success(business.to_dict(), "Business updated")


@bp.get("/current/settings")
@require_business()
def get_settings():
    settings = g.current_business.settings or BusinessSetting(business_id=g.current_business.id)
    if not settings.id:
        db.session.add(settings)
        db.session.commit()
    return success(settings.to_dict())


@bp.put("/current/settings")
@require_business("manager")
def upsert_settings():
    data = request.get_json(silent=True) or {}
    settings = g.current_business.settings
    if not settings:
        settings = BusinessSetting(business_id=g.current_business.id)
        db.session.add(settings)

    for field in [
        "delivery_enabled",
        "minimum_order_delivery",
        "delivery_fee",
        "free_delivery_threshold",
        "estimated_prep_time_minutes",
        "accept_cash",
        "accept_card",
        "accept_online",
        "cash_only_threshold",
        "require_prepayment",
    ]:
        if field in data:
            setattr(settings, field, data[field])

    db.session.commit()
    return success(settings.to_dict(), "Settings updated")


@bp.get("/current/hours")
@require_business()
def list_hours():
    hours = BusinessHour.query.filter_by(business_id=g.current_business.id).order_by(BusinessHour.day_of_week.asc()).all()
    return success([item.to_dict() for item in hours])


@bp.put("/current/hours")
@require_business("manager")
def replace_hours():
    data = request.get_json(silent=True) or {}
    items = data.get("hours", [])
    if not isinstance(items, list):
        return error("hours must be a list", 400)

    BusinessHour.query.filter_by(business_id=g.current_business.id).delete()
    for item in items:
        db.session.add(
            BusinessHour(
                business_id=g.current_business.id,
                day_of_week=int(item["day_of_week"]),
                open_time=_parse_time(item.get("open_time")),
                close_time=_parse_time(item.get("close_time")),
                is_closed=bool(item.get("is_closed", False)),
            )
        )

    db.session.commit()
    return success(message="Hours replaced")


@bp.get("/current/delivery-zones")
@require_business()
def list_delivery_zones():
    zones = BusinessDeliveryZone.query.filter_by(business_id=g.current_business.id).order_by(BusinessDeliveryZone.id.desc()).all()
    return success([item.to_dict() for item in zones])


@bp.post("/current/delivery-zones")
@require_business("manager")
def create_delivery_zone():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return error("name is required", 400)
    zone = BusinessDeliveryZone(business_id=g.current_business.id, name=name, is_active=data.get("is_active", True))
    db.session.add(zone)
    db.session.commit()
    return success(zone.to_dict(), "Delivery zone created", 201)


@bp.delete("/current/delivery-zones/<int:zone_id>")
@require_business("manager")
def delete_delivery_zone(zone_id):
    zone = BusinessDeliveryZone.query.filter_by(id=zone_id, business_id=g.current_business.id).first()
    if not zone:
        return error("Delivery zone not found", 404)
    db.session.delete(zone)
    db.session.commit()
    return success(message="Delivery zone deleted")


@bp.get("/current/promotions")
@require_business()
def list_promotions():
    items = BusinessPromotion.query.filter_by(business_id=g.current_business.id).order_by(BusinessPromotion.id.desc()).all()
    return success([item.to_dict() for item in items])


@bp.post("/current/promotions")
@require_business("manager")
def create_promotion():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return error("text is required", 400)
    item = BusinessPromotion(
        business_id=g.current_business.id,
        text=text,
        is_active=data.get("is_active", True),
        starts_at=datetime.fromisoformat(data["starts_at"]) if data.get("starts_at") else None,
        ends_at=datetime.fromisoformat(data["ends_at"]) if data.get("ends_at") else None,
    )
    db.session.add(item)
    db.session.commit()
    return success(item.to_dict(), "Promotion created", 201)


@bp.delete("/current/promotions/<int:promotion_id>")
@require_business("manager")
def delete_promotion(promotion_id):
    item = BusinessPromotion.query.filter_by(id=promotion_id, business_id=g.current_business.id).first()
    if not item:
        return error("Promotion not found", 404)
    db.session.delete(item)
    db.session.commit()
    return success(message="Promotion deleted")


@bp.get("/current/policies")
@require_business()
def list_policies():
    items = BusinessPolicy.query.filter_by(business_id=g.current_business.id).order_by(BusinessPolicy.id.desc()).all()
    return success([item.to_dict() for item in items])


@bp.post("/current/policies")
@require_business("manager")
def create_policy():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return error("text is required", 400)
    item = BusinessPolicy(business_id=g.current_business.id, text=text, is_active=data.get("is_active", True))
    db.session.add(item)
    db.session.commit()
    return success(item.to_dict(), "Policy created", 201)


@bp.delete("/current/policies/<int:policy_id>")
@require_business("manager")
def delete_policy(policy_id):
    item = BusinessPolicy.query.filter_by(id=policy_id, business_id=g.current_business.id).first()
    if not item:
        return error("Policy not found", 404)
    db.session.delete(item)
    db.session.commit()
    return success(message="Policy deleted")


@bp.get("/current/faqs")
@require_business()
def list_faqs():
    items = FAQ.query.filter_by(business_id=g.current_business.id).order_by(FAQ.sort_order.asc(), FAQ.id.asc()).all()
    return success([item.to_dict() for item in items])


@bp.post("/current/faqs")
@require_business("manager")
def create_faq():
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    answer = (data.get("answer") or "").strip()
    if not question or not answer:
        return error("question and answer are required", 400)
    item = FAQ(
        business_id=g.current_business.id,
        category=data.get("category"),
        question=question,
        answer=answer,
        sort_order=int(data.get("sort_order", 0)),
        is_active=bool(data.get("is_active", True)),
    )
    db.session.add(item)
    db.session.commit()
    return success(item.to_dict(), "FAQ created", 201)


@bp.put("/current/faqs/<int:faq_id>")
@require_business("manager")
def update_faq(faq_id):
    item = FAQ.query.filter_by(id=faq_id, business_id=g.current_business.id).first()
    if not item:
        return error("FAQ not found", 404)
    data = request.get_json(silent=True) or {}
    for field in ["category", "question", "answer", "sort_order", "is_active"]:
        if field in data:
            setattr(item, field, data[field])
    db.session.commit()
    return success(item.to_dict(), "FAQ updated")


@bp.delete("/current/faqs/<int:faq_id>")
@require_business("manager")
def delete_faq(faq_id):
    item = FAQ.query.filter_by(id=faq_id, business_id=g.current_business.id).first()
    if not item:
        return error("FAQ not found", 404)
    db.session.delete(item)
    db.session.commit()
    return success(message="FAQ deleted")
