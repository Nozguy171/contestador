from decimal import Decimal

from flask import Blueprint, g, request

from app.extensions import db
from app.models import Order
from app.models.enums import ChangedByType, OrderStatus, OrderType, PaymentMethod
from app.services.customers import get_or_create_customer
from app.services.inventory import InventoryStockError, apply_order_inventory_transition
from app.services.orders import (
    OrderValidationError,
    append_status_history,
    create_order_from_quote,
    quote_voice_order,
    serialize_order,
    validate_order_status_transition,
)
from app.utils.auth import require_business
from app.utils.responses import error, success

bp = Blueprint("orders", __name__, url_prefix="/api/v1/orders")


@bp.get("")
@require_business()
def list_orders():
    query = Order.query.filter_by(business_id=g.current_business.id)

    status = request.args.get("status")
    if status:
        query = query.filter_by(status=status)

    order_type = request.args.get("type")
    if order_type:
        query = query.filter_by(type=order_type)

    phone_number = request.args.get("phone_number")
    if phone_number:
        query = query.filter(Order.phone_number.ilike(f"%{phone_number}%"))

    source = request.args.get("source")
    if source:
        query = query.filter_by(source=source)

    items = query.order_by(Order.id.desc()).all()
    return success([serialize_order(item) for item in items])


@bp.get("/<int:order_id>")
@require_business()
def get_order(order_id):
    item = Order.query.filter_by(id=order_id, business_id=g.current_business.id).first()
    if not item:
        return error("Order not found", 404)
    return success(serialize_order(item))


@bp.post("")
@require_business("agent")
def create_order():
    data = request.get_json(silent=True) or {}
    items_payload = data.get("items", [])
    if not items_payload:
        return error("items are required", 400)
    required = ["type", "payment_method"]
    missing = [field for field in required if not data.get(field)]
    if missing:
        return error(f"Missing required fields: {', '.join(missing)}", 400)
    source = str(data.get("source") or "pos").strip().lower()
    if source not in {"pos", "kiosk"}:
        return error("source must be pos or kiosk", 400)
    customer_name = str(data.get("customer_name") or "Mostrador").strip() or "Mostrador"
    phone_number = str(data.get("phone_number") or "MOSTRADOR").strip() or "MOSTRADOR"
    cart = [
        {
            "product_id": item.get("product_id"),
            "quantity": item.get("quantity", 1),
            "modifier_ids": item.get("modifier_ids", []),
            "notes": item.get("notes"),
        }
        for item in items_payload
    ]
    checkout = {
        "customer_name": customer_name,
        "order_type": data.get("type"),
        "payment_method": data.get("payment_method"),
        "cash_change_for": data.get("cash_change_for"),
        "delivery_address": data.get("delivery_address"),
        "notes": data.get("notes"),
    }
    try:
        quote = quote_voice_order(business=g.current_business, cart=cart, checkout=checkout)
    except OrderValidationError as exc:
        return error(str(exc), 400)
    order = create_order_from_quote(
        business=g.current_business,
        quote=quote,
        phone_number=phone_number,
        source=source,
        changed_by_user_id=g.current_user.id,
        changed_by_label=g.current_user.name,
    )
    db.session.commit()
    return success(serialize_order(order), "Order created", 201)


@bp.post("/quote")
@require_business("agent")
def quote_order():
    data = request.get_json(silent=True) or {}
    items_payload = data.get("items", [])
    if not items_payload:
        return error("items are required", 400)
    cart = [
        {
            "product_id": item.get("product_id"),
            "quantity": item.get("quantity", 1),
            "modifier_ids": item.get("modifier_ids", []),
            "notes": item.get("notes"),
        }
        for item in items_payload
    ]
    checkout = {
        "customer_name": str(data.get("customer_name") or "Mostrador").strip() or "Mostrador",
        "order_type": data.get("type"),
        "payment_method": data.get("payment_method"),
        "cash_change_for": data.get("cash_change_for"),
        "delivery_address": data.get("delivery_address"),
        "notes": data.get("notes"),
    }
    try:
        quote = quote_voice_order(business=g.current_business, cart=cart, checkout=checkout)
    except OrderValidationError as exc:
        return error(str(exc), 400)
    return success(quote)


@bp.put("/<int:order_id>")
@require_business("agent")
def update_order(order_id):
    item = Order.query.filter_by(
        id=order_id,
        business_id=g.current_business.id,
    ).with_for_update().first()
    if not item:
        return error("Order not found", 404)

    data = request.get_json(silent=True) or {}
    for field in [
        "customer_name",
        "phone_number",
        "type",
        "delivery_fee",
        "delivery_address",
        "notes",
        "payment_method",
        "cash_change_for",
        "ai_call_summary",
        "transcript_preview",
        "call_log_id",
    ]:
        if field in data:
            value = data[field]
            if field == "type":
                value = OrderType(value)
            if field == "payment_method":
                value = PaymentMethod(value)
            setattr(item, field, value)

    if "status" in data and data["status"] != item.status.value:
        try:
            next_status = OrderStatus(data["status"])
        except ValueError:
            return error("El estado del pedido no es válido.", 400)
        try:
            next_status = validate_order_status_transition(item, next_status)
        except OrderValidationError as exc:
            return error(str(exc), 409)
        try:
            apply_order_inventory_transition(
                item,
                next_status.value,
                changed_by_user_id=g.current_user.id,
                changed_by_label=g.current_user.name,
            )
        except InventoryStockError as exc:
            db.session.rollback()
            return error(str(exc), 409)
        item.status = next_status
        append_status_history(
            item,
            data["status"],
            changed_by_type=ChangedByType.USER,
            changed_by_user_id=g.current_user.id,
            changed_by_label=g.current_user.name,
        )

    if "customer_name" in data or "phone_number" in data:
        item.customer = get_or_create_customer(
            business_id=item.business_id,
            phone_number=item.phone_number,
            name=item.customer_name,
            last_order_at=item.created_at,
        )

    db.session.commit()
    return success(serialize_order(item), "Order updated")
