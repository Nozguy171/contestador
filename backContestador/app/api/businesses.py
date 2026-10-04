from datetime import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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
    GeoCatalogVersion,
    GeoLocality,
    GeoSettlement,
)
from app.models.enums import BusinessRole
from app.services.promotions import (
    PromotionValidationError,
    serialize_promotion,
    validate_promotion_payload,
)
from app.services.voice_runtime import GEMINI_VOICE_NAMES
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


def _normalize_settlement_names(values):
    if values in (None, ""):
        return []
    if not isinstance(values, list):
        return None
    normalized = []
    seen = set()
    for raw in values:
        name = " ".join(str(raw or "").split()).strip()
        if not name:
            continue
        if len(name) > 200:
            return None
        key = " ".join(name.casefold().split())
        if key not in seen:
            seen.add(key)
            normalized.append(name)
    return normalized


def _normalize_settlement_keys(values):
    if values in (None, ""):
        return []
    if not isinstance(values, list):
        return None
    normalized = []
    seen = set()
    for raw in values:
        key = str(raw or "").strip()
        if not key:
            continue
        if len(key) > 32:
            return None
        if key not in seen:
            seen.add(key)
            normalized.append(key)
    return normalized if len(normalized) <= 1000 else None


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

    mode = data.get("voice_address_mode", getattr(settings, "voice_address_mode", None) or "off")
    if not isinstance(mode, str) or mode not in {"off", "shadow", "candidate", "enforce"}:
        return error("El modo de resolución de domicilios no es válido.", 400)
    if mode in {"candidate", "enforce"}:
        if not g.current_business.geo_catalog_version_id or not g.current_business.locality_code:
            return error("Selecciona primero un catálogo geográfico y la localidad del negocio.", 400)
    if mode == "enforce":
        configured_keys = {
            str(key)
            for zone in g.current_business.delivery_zones
            if zone.is_active
            for key in (zone.settlement_keys or [])
        }
        valid_count = GeoSettlement.query.filter(
            GeoSettlement.catalog_version_id == g.current_business.geo_catalog_version_id,
            GeoSettlement.locality_code == g.current_business.locality_code,
            GeoSettlement.source_key.in_(configured_keys or [""]),
        ).count()
        if not valid_count:
            return error("Selecciona al menos un asentamiento del catálogo vigente en una zona antes de activar enforcement.", 400)

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
        "voice_enabled",
        "voice_name",
        "insights_enabled",
        "timezone",
        "voice_address_mode",
        "voice_menu_v2_enabled",
    ]:
        if field in data:
            if field == "voice_name" and data[field] not in GEMINI_VOICE_NAMES:
                return error("La voz seleccionada no es válida.", 400)
            if field == "voice_menu_v2_enabled" and not isinstance(data[field], bool):
                return error("La opción de menú conversacional debe ser booleana.", 400)
            if field == "voice_address_mode" and (
                not isinstance(data[field], str)
                or data[field] not in {"off", "shadow", "candidate", "enforce"}
            ):
                return error("El modo de resolución de domicilios no es válido.", 400)
            if field == "timezone":
                try:
                    ZoneInfo(str(data[field]))
                except ZoneInfoNotFoundError:
                    return error("La zona horaria no es válida.", 400)
            setattr(settings, field, data[field])

    db.session.commit()
    return success(settings.to_dict(), "Settings updated")


@bp.get("/current/address-catalogs")
@require_business()
def list_address_catalogs():
    versions = GeoCatalogVersion.query.order_by(
        GeoCatalogVersion.entity_code,
        GeoCatalogVersion.municipality_code,
        GeoCatalogVersion.edition.desc(),
    ).all()
    return success([
        {
            "id": item.id,
            "source": item.source,
            "edition": item.edition,
            "entity_code": item.entity_code,
            "entity_name": item.entity_name,
            "municipality_code": item.municipality_code,
            "municipality_name": item.municipality_name,
            "checksum_sha256": item.checksum_sha256,
            "imported_at": item.imported_at,
        }
        for item in versions
    ])


@bp.get("/current/address-catalogs/<int:version_id>/localities")
@require_business()
def list_address_catalog_localities(version_id):
    version = db.session.get(GeoCatalogVersion, version_id)
    if not version:
        return error("No encontramos esa versión del catálogo.", 404)
    items = GeoLocality.query.filter_by(catalog_version_id=version.id).order_by(GeoLocality.name).all()
    return success([{"code": item.locality_code, "name": item.name} for item in items])


@bp.get("/current/address-catalogs/<int:version_id>/settlements")
@require_business()
def list_address_catalog_settlements(version_id):
    version = db.session.get(GeoCatalogVersion, version_id)
    locality_code = str(request.args.get("locality_code") or "").strip().zfill(4)
    locality = GeoLocality.query.filter_by(
        catalog_version_id=version_id,
        locality_code=locality_code,
    ).first()
    if not version or not locality:
        return error("El catálogo y la localidad seleccionados no coinciden.", 404)
    items = GeoSettlement.query.filter_by(
        catalog_version_id=version_id,
        locality_code=locality_code,
    ).order_by(GeoSettlement.name, GeoSettlement.source_key).all()
    return success([
        {
            "key": item.source_key,
            "name": item.name,
            "type": item.settlement_type,
        }
        for item in items
    ])


@bp.put("/current/location")
@require_business("manager")
def update_business_location():
    data = request.get_json(silent=True) or {}
    raw_version_id = data.get("geo_catalog_version_id")
    try:
        version_id = int(raw_version_id) if raw_version_id not in (None, "") else None
    except (TypeError, ValueError):
        return error("La versión del catálogo no es válida.", 400)
    locality_code = str(data.get("locality_code") or "").strip()
    version = db.session.get(GeoCatalogVersion, version_id) if version_id else None
    if version_id and not version:
        return error("No encontramos esa versión del catálogo.", 400)
    locality = (
        GeoLocality.query.filter_by(
            catalog_version_id=version.id,
            locality_code=locality_code,
        ).first()
        if version and locality_code
        else None
    )
    if locality_code and not locality:
        return error("La localidad no pertenece a la versión seleccionada.", 400)
    if version and not locality:
        return error("Selecciona la localidad del negocio.", 400)

    business = g.current_business
    if version:
        business.country_code = "MX"
        business.state_code = version.entity_code
        business.state_name = version.entity_name or str(data.get("state_name") or "").strip() or None
        business.municipality_code = version.municipality_code
        business.municipality_name = version.municipality_name or str(data.get("municipality_name") or "").strip() or None
        business.locality_code = locality.locality_code
        business.locality_name = locality.name
        business.geo_catalog_version_id = version.id
    else:
        business.country_code = None
        business.state_code = None
        business.state_name = None
        business.municipality_code = None
        business.municipality_name = None
        business.locality_code = None
        business.locality_name = None
        business.geo_catalog_version_id = None
    db.session.commit()
    return success({
        "country_code": business.country_code,
        "state_code": business.state_code,
        "state_name": business.state_name,
        "municipality_code": business.municipality_code,
        "municipality_name": business.municipality_name,
        "locality_code": business.locality_code,
        "locality_name": business.locality_name,
        "geo_catalog_version_id": business.geo_catalog_version_id,
    }, "Ubicación del negocio actualizada.")


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
    settlement_names = _normalize_settlement_names(data.get("settlement_names", []))
    if settlement_names is None:
        return error("Las colonias deben ser una lista de nombres de hasta 200 caracteres.", 400)
    zone = BusinessDeliveryZone(
        business_id=g.current_business.id,
        name=name,
        is_active=data.get("is_active", True),
        settlement_names=settlement_names,
    )
    db.session.add(zone)
    db.session.commit()
    return success(zone.to_dict(), "Delivery zone created", 201)


@bp.put("/current/delivery-zones/<int:zone_id>")
@require_business("manager")
def update_delivery_zone(zone_id):
    zone = BusinessDeliveryZone.query.filter_by(
        id=zone_id,
        business_id=g.current_business.id,
    ).first()
    if not zone:
        return error("Delivery zone not found", 404)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = str(data.get("name") or "").strip()
        if not name:
            return error("El nombre de la zona es obligatorio.", 400)
        zone.name = name
    if "settlement_names" in data:
        settlement_names = _normalize_settlement_names(data["settlement_names"])
        if settlement_names is None:
            return error("Las colonias deben ser una lista de nombres de hasta 200 caracteres.", 400)
        zone.settlement_names = settlement_names
    if "settlement_keys" in data:
        settlement_keys = _normalize_settlement_keys(data["settlement_keys"])
        if settlement_keys is None:
            return error("Selecciona una lista válida de hasta 1,000 asentamientos del catálogo.", 400)
        business = g.current_business
        if settlement_keys and (not business.geo_catalog_version_id or not business.locality_code):
            return error("Guarda primero el catálogo y la localidad del negocio.", 400)
        if settlement_keys:
            valid_count = GeoSettlement.query.filter(
                GeoSettlement.catalog_version_id == business.geo_catalog_version_id,
                GeoSettlement.locality_code == business.locality_code,
                GeoSettlement.source_key.in_(settlement_keys),
            ).count()
            if valid_count != len(settlement_keys):
                return error("Uno o más asentamientos no pertenecen al catálogo y localidad configurados.", 400)
        zone.settlement_keys = settlement_keys
    if "is_active" in data:
        zone.is_active = bool(data["is_active"])
    db.session.commit()
    return success(zone.to_dict(), "Delivery zone updated")


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
    timezone_name = g.current_business.settings.timezone if g.current_business.settings else "UTC"
    return success([serialize_promotion(item, timezone_name) for item in items])


@bp.post("/current/promotions")
@require_business("manager")
def create_promotion():
    data = request.get_json(silent=True) or {}
    try:
        values = validate_promotion_payload(
            data,
            g.current_business.id,
            g.current_business.settings.timezone if g.current_business.settings else "UTC",
        )
    except PromotionValidationError as exc:
        return error(str(exc), 400)
    item = BusinessPromotion(business_id=g.current_business.id, **values)
    db.session.add(item)
    db.session.commit()
    return success(serialize_promotion(item, g.current_business.settings.timezone), "Promotion created", 201)


@bp.put("/current/promotions/<int:promotion_id>")
@require_business("manager")
def update_promotion(promotion_id):
    item = BusinessPromotion.query.filter_by(id=promotion_id, business_id=g.current_business.id).first()
    if not item:
        return error("Promotion not found", 404)
    data = request.get_json(silent=True) or {}
    merged = item.to_dict()
    merged.update(data)
    try:
        values = validate_promotion_payload(
            merged,
            g.current_business.id,
            g.current_business.settings.timezone if g.current_business.settings else "UTC",
        )
    except PromotionValidationError as exc:
        return error(str(exc), 400)
    for field, value in values.items():
        setattr(item, field, value)
    db.session.commit()
    return success(serialize_promotion(item, g.current_business.settings.timezone), "Promotion updated")


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
