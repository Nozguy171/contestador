from decimal import Decimal

from flask import Blueprint, g, request

from app.extensions import db
from app.models import Order
from app.models.enums import ChangedByType, OrderStatus, OrderType, PaymentMethod
from app.services.customers import get_or_create_customer
from app.services.orders import append_status_history, build_order_items, generate_folio, serialize_order
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
    required = ["customer_name", "phone_number", "type", "payment_method"]
    missing = [field for field in required if not data.get(field)]
    if missing:
        return error(f"Missing required fields: {', '.join(missing)}", 400)

    order = Order(
        business_id=g.current_business.id,
        call_log_id=data.get("call_log_id"),
        folio=data.get("folio") or generate_folio(),
        customer_name=data["customer_name"],
        phone_number=data["phone_number"],
        type=OrderType(data["type"]),
        status=OrderStatus(data.get("status", OrderStatus.NEW.value if hasattr(OrderStatus.NEW, "value") else OrderStatus.NEW)),
        delivery_fee=Decimal(str(data.get("delivery_fee", 0))),
        delivery_address=data.get("delivery_address"),
        notes=data.get("notes"),
        payment_method=PaymentMethod(data["payment_method"]),
        ai_call_summary=data.get("ai_call_summary"),
        transcript_preview=data.get("transcript_preview"),
    )
    customer = get_or_create_customer(
        business_id=g.current_business.id,
        phone_number=data["phone_number"],
        name=data["customer_name"],
    )
    order.customer = customer
    subtotal = build_order_items(order, items_payload)
    order.subtotal = subtotal
    order.total = subtotal + Decimal(str(data.get("delivery_fee", 0)))
    append_status_history(
        order,
        order.status,
        changed_by_type=ChangedByType.USER,
        changed_by_user_id=g.current_user.id,
        changed_by_label=g.current_user.name,
    )

    db.session.add(order)
    db.session.flush()
    if customer:
        customer.last_order_at = order.created_at
    db.session.commit()
    return success(serialize_order(order), "Order created", 201)


@bp.put("/<int:order_id>")
@require_business("agent")
def update_order(order_id):
    item = Order.query.filter_by(id=order_id, business_id=g.current_business.id).first()
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
        item.status = OrderStatus(data["status"])
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
