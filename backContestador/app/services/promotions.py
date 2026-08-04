from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from app.models import Category, Product


PROMOTION_TYPES = {"percentage", "two_for_one", "second_half"}
PROMOTION_SCOPES = {"all", "category", "product"}


class PromotionValidationError(ValueError):
    pass


def _local(value, timezone_name):
    zone = ZoneInfo(timezone_name or "UTC")
    if value is None:
        return datetime.now(zone)
    if value.tzinfo is None:
        return value.replace(tzinfo=zone)
    return value.astimezone(zone)


def promotion_is_active(promotion, now=None, timezone_name="UTC"):
    now = _local(now, timezone_name)
    if not promotion.is_active:
        return False
    if promotion.starts_at and now < _local(promotion.starts_at, timezone_name):
        return False
    if promotion.ends_at and now > _local(promotion.ends_at, timezone_name):
        return False
    days = promotion.days_of_week or []
    return not days or now.weekday() in days


def promotion_status(promotion, now=None, timezone_name="UTC"):
    now = _local(now, timezone_name)
    if not promotion.is_active:
        return "inactive"
    if promotion.starts_at and now < _local(promotion.starts_at, timezone_name):
        return "scheduled"
    if promotion.ends_at and now > _local(promotion.ends_at, timezone_name):
        return "expired"
    if promotion.days_of_week and now.weekday() not in promotion.days_of_week:
        return "scheduled"
    return "active"


def promotion_description(promotion):
    if promotion.text:
        return promotion.text
    if promotion.promotion_type == "percentage":
        return f"{promotion.value:g}% de descuento"
    if promotion.promotion_type == "two_for_one":
        return "Promoción 2x1"
    return "La segunda unidad a mitad de precio"


def serialize_promotion(promotion, timezone_name="UTC"):
    payload = promotion.to_dict()
    payload["starts_at"] = (
        _local(promotion.starts_at, timezone_name).isoformat() if promotion.starts_at else None
    )
    payload["ends_at"] = (
        _local(promotion.ends_at, timezone_name).isoformat() if promotion.ends_at else None
    )
    payload["status"] = promotion_status(promotion, timezone_name=timezone_name)
    payload["customer_description"] = promotion_description(promotion)
    return payload


def _parse_datetime(value, field, timezone_name):
    if value in (None, ""):
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise PromotionValidationError(f"{field} no tiene una fecha válida.") from exc
    return _local(parsed, timezone_name)


def validate_promotion_payload(data, business_id, timezone_name="UTC"):
    name = str(data.get("name") or "").strip()
    text = str(data.get("text") or "").strip()
    promotion_type = str(data.get("promotion_type") or "").strip()
    scope_type = str(data.get("scope_type") or "all").strip()
    if not name:
        raise PromotionValidationError("Ponle un nombre a la promoción.")
    if not text:
        raise PromotionValidationError("Escribe cómo se le anunciará al cliente.")
    if promotion_type not in PROMOTION_TYPES:
        raise PromotionValidationError("El tipo de promoción no es válido.")
    if scope_type not in PROMOTION_SCOPES:
        raise PromotionValidationError("El alcance de la promoción no es válido.")

    try:
        value = Decimal(str(data.get("value") or 0)).quantize(Decimal("0.01"))
    except Exception as exc:
        raise PromotionValidationError("El descuento debe ser un número válido.") from exc
    if promotion_type == "percentage" and not Decimal("0") < value <= Decimal("100"):
        raise PromotionValidationError("El porcentaje debe estar entre 0.01 y 100.")
    if promotion_type != "percentage":
        value = Decimal("0.00")

    product_id = data.get("product_id") or None
    category_id = data.get("category_id") or None
    if scope_type == "product":
        try:
            product_id = int(product_id)
        except (TypeError, ValueError) as exc:
            raise PromotionValidationError("Selecciona un producto.") from exc
        if not Product.query.filter_by(id=product_id, business_id=business_id).first():
            raise PromotionValidationError("El producto seleccionado no pertenece a este negocio.")
        category_id = None
    elif scope_type == "category":
        try:
            category_id = int(category_id)
        except (TypeError, ValueError) as exc:
            raise PromotionValidationError("Selecciona una categoría.") from exc
        if not Category.query.filter_by(id=category_id, business_id=business_id).first():
            raise PromotionValidationError("La categoría seleccionada no pertenece a este negocio.")
        product_id = None
    else:
        product_id = category_id = None

    raw_days = data.get("days_of_week") or []
    if not isinstance(raw_days, list):
        raise PromotionValidationError("Los días de la promoción no son válidos.")
    try:
        days = sorted(set(int(day) for day in raw_days))
    except (TypeError, ValueError) as exc:
        raise PromotionValidationError("Los días de la promoción no son válidos.") from exc
    if any(day < 0 or day > 6 for day in days):
        raise PromotionValidationError("Los días deben estar entre lunes y domingo.")

    starts_at = _parse_datetime(data.get("starts_at"), "La fecha de inicio", timezone_name)
    ends_at = _parse_datetime(data.get("ends_at"), "La fecha de fin", timezone_name)
    if starts_at and ends_at and ends_at <= starts_at:
        raise PromotionValidationError("La fecha de fin debe ser posterior al inicio.")

    return {
        "name": name,
        "text": text,
        "promotion_type": promotion_type,
        "value": value,
        "scope_type": scope_type,
        "product_id": product_id,
        "category_id": category_id,
        "days_of_week": days,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "is_active": bool(data.get("is_active", True)),
    }


def _eligible(item, promotion):
    if promotion.scope_type == "all":
        return True
    if promotion.scope_type == "product":
        return item["product_id"] == promotion.product_id
    return item["category_id"] == promotion.category_id


def calculate_best_promotion(business, quote_items, now=None):
    best_promotion = None
    best_discount = Decimal("0.00")
    timezone_name = business.settings.timezone if business.settings else "UTC"
    for promotion in business.promotions:
        if not promotion_is_active(promotion, now, timezone_name):
            continue
        discount = Decimal("0.00")
        for item in quote_items:
            if not _eligible(item, promotion):
                continue
            base_price = Decimal(str(item["unit_price"]))
            quantity = int(item["quantity"])
            if promotion.promotion_type == "percentage":
                discount += base_price * quantity * Decimal(promotion.value) / Decimal("100")
            elif promotion.promotion_type == "two_for_one":
                discount += base_price * (quantity // 2)
            elif promotion.promotion_type == "second_half":
                discount += base_price * (quantity // 2) * Decimal("0.50")
        discount = discount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if discount > best_discount:
            best_promotion = promotion
            best_discount = discount
    return best_promotion, best_discount
