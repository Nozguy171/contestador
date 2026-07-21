from decimal import Decimal
from uuid import uuid4

from app.extensions import db
from app.models import Order, OrderItem, OrderItemModifier, OrderStatusHistory, Product
from app.models.enums import ChangedByType, OrderStatus, OrderType, PaymentMethod
from app.services.customers import get_or_create_customer


class OrderValidationError(ValueError):
    pass


def serialize_order(order):
    payload = order.to_dict()
    payload["items"] = []
    payload["status_history"] = [item.to_dict() for item in order.status_history]
    for item in order.items:
        row = item.to_dict()
        row["modifiers"] = [modifier.to_dict() for modifier in item.modifiers]
        payload["items"].append(row)
    return payload


def generate_folio():
    return f"ORD-{uuid4().hex[:10].upper()}"


def _to_decimal(value):
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value)).quantize(Decimal("0.01"))


def build_order_items(order, items_payload):
    subtotal = Decimal("0.00")

    for raw_item in items_payload:
        quantity = int(raw_item.get("quantity", 1))
        price = _to_decimal(raw_item.get("price", 0))
        modifier_total = Decimal("0.00")

        order_item = OrderItem(
            product_id=raw_item.get("product_id"),
            name_snapshot=raw_item["name_snapshot"],
            quantity=quantity,
            price=price,
            notes=raw_item.get("notes"),
            line_total=Decimal("0.00"),
        )

        for raw_modifier in raw_item.get("modifiers", []):
            modifier_price = _to_decimal(raw_modifier.get("price", 0))
            modifier_total += modifier_price
            order_item.modifiers.append(
                OrderItemModifier(
                    product_modifier_id=raw_modifier.get("product_modifier_id"),
                    name_snapshot=raw_modifier["name_snapshot"],
                    price=modifier_price,
                )
            )

        line_total = (price + modifier_total) * quantity
        order_item.line_total = line_total
        subtotal += line_total
        order.items.append(order_item)

    return subtotal


def append_status_history(order, status, changed_by_type=ChangedByType.USER, changed_by_user_id=None, changed_by_label=None):
    order.status_history.append(
        OrderStatusHistory(
            status=OrderStatus(status) if isinstance(status, str) else status,
            changed_by_type=changed_by_type,
            changed_by_user_id=changed_by_user_id,
            changed_by_label=changed_by_label,
        )
    )


def _required_text(payload, field, label):
    value = str(payload.get(field) or "").strip()
    if not value:
        raise OrderValidationError(f"Falta confirmar {label}.")
    return value


def quote_voice_order(*, business, cart, checkout):
    if not cart:
        raise OrderValidationError("El carrito está vacío.")

    try:
        order_type = OrderType(str(checkout.get("order_type")))
        payment_method = PaymentMethod(str(checkout.get("payment_method")))
    except ValueError as exc:
        raise OrderValidationError("Tipo de pedido o método de pago inválido.") from exc

    customer_name = _required_text(checkout, "customer_name", "el nombre del cliente")
    delivery_address = str(checkout.get("delivery_address") or "").strip() or None
    notes = str(checkout.get("notes") or "").strip() or None
    settings = business.settings

    if order_type == OrderType.DELIVERY:
        if settings and not settings.delivery_enabled:
            raise OrderValidationError("El negocio no tiene entregas habilitadas.")
        if not delivery_address:
            raise OrderValidationError("Falta confirmar la dirección de entrega.")

    payment_allowed = {
        PaymentMethod.CASH: not settings or settings.accept_cash,
        PaymentMethod.CARD: not settings or settings.accept_card,
        PaymentMethod.ONLINE: not settings or settings.accept_online,
    }
    if not payment_allowed[payment_method]:
        raise OrderValidationError("El método de pago elegido no está habilitado.")

    quote_items = []
    subtotal = Decimal("0.00")
    for raw_item in cart:
        try:
            product_id = int(raw_item.get("product_id"))
            quantity = int(raw_item.get("quantity", 1))
            modifier_ids = [int(value) for value in raw_item.get("modifier_ids", [])]
        except (TypeError, ValueError) as exc:
            raise OrderValidationError("Hay un producto, cantidad o modificador inválido.") from exc
        if quantity < 1 or quantity > 99:
            raise OrderValidationError("La cantidad de cada producto debe estar entre 1 y 99.")
        if len(modifier_ids) != len(set(modifier_ids)):
            raise OrderValidationError("Un modificador está repetido en el mismo producto.")

        product = Product.query.filter_by(
            id=product_id,
            business_id=business.id,
            is_active=True,
        ).first()
        if not product or product.is_sold_out:
            raise OrderValidationError(f"El producto {product_id} no está disponible.")

        modifier_map = {
            modifier.id: modifier
            for modifier in product.modifiers
            if modifier.is_active and modifier.id in modifier_ids
        }
        if len(modifier_map) != len(modifier_ids):
            raise OrderValidationError(f"Hay modificadores inválidos para {product.name}.")

        modifiers = [
            {
                "id": modifier.id,
                "name": modifier.name,
                "price": f"{modifier.price:.2f}",
            }
            for modifier in sorted(modifier_map.values(), key=lambda item: (item.sort_order, item.id))
        ]
        modifier_total = sum((_to_decimal(item["price"]) for item in modifiers), Decimal("0.00"))
        line_total = (product.price + modifier_total) * quantity
        subtotal += line_total
        quote_items.append(
            {
                "line_id": str(raw_item.get("line_id") or product.id),
                "product_id": product.id,
                "name": product.name,
                "quantity": quantity,
                "unit_price": f"{product.price:.2f}",
                "modifiers": modifiers,
                "notes": str(raw_item.get("notes") or "").strip() or None,
                "line_total": f"{line_total:.2f}",
            }
        )

    if order_type == OrderType.DELIVERY and settings and settings.minimum_order_delivery:
        if subtotal < settings.minimum_order_delivery:
            raise OrderValidationError(f"El mínimo para entrega es ${settings.minimum_order_delivery}.")
    if settings and settings.cash_only_threshold and subtotal >= settings.cash_only_threshold:
        if payment_method != PaymentMethod.CASH:
            raise OrderValidationError(
                f"Pedidos desde ${settings.cash_only_threshold} sólo aceptan efectivo."
            )
    if settings and settings.require_prepayment and payment_method == PaymentMethod.CASH:
        raise OrderValidationError("Este negocio requiere un método de pago anticipado.")

    delivery_fee = Decimal("0.00")
    if order_type == OrderType.DELIVERY and settings and settings.delivery_fee:
        delivery_fee = settings.delivery_fee
    if (
        order_type == OrderType.DELIVERY
        and settings
        and settings.free_delivery_threshold
        and subtotal >= settings.free_delivery_threshold
    ):
        delivery_fee = Decimal("0.00")

    return {
        "items": quote_items,
        "customer_name": customer_name,
        "order_type": order_type.value,
        "payment_method": payment_method.value,
        "delivery_address": delivery_address,
        "notes": notes,
        "subtotal": f"{subtotal:.2f}",
        "delivery_fee": f"{delivery_fee:.2f}",
        "total": f"{subtotal + delivery_fee:.2f}",
    }


def submit_voice_order(*, business, call_log, caller_phone, quote):
    existing = Order.query.filter_by(call_log_id=call_log.id).first()
    if existing:
        return existing, True

    order = Order(
        business_id=business.id,
        call_log_id=call_log.id,
        folio=generate_folio(),
        customer_name=quote["customer_name"],
        phone_number=caller_phone or call_log.phone_number,
        type=OrderType(quote["order_type"]),
        status=OrderStatus.NEW,
        subtotal=_to_decimal(quote["subtotal"]),
        delivery_fee=_to_decimal(quote["delivery_fee"]),
        total=_to_decimal(quote["total"]),
        delivery_address=quote.get("delivery_address"),
        notes=quote.get("notes"),
        payment_method=PaymentMethod(quote["payment_method"]),
        ai_call_summary="Pedido confirmado por Gemini Live durante la llamada.",
        transcript_preview=(call_log.transcript or "")[-2000:] or None,
    )
    order.customer = get_or_create_customer(
        business_id=business.id,
        phone_number=order.phone_number,
        name=order.customer_name,
    )
    build_order_items(
        order,
        [
            {
                "product_id": item["product_id"],
                "name_snapshot": item["name"],
                "quantity": item["quantity"],
                "price": item["unit_price"],
                "notes": item.get("notes"),
                "modifiers": [
                    {
                        "product_modifier_id": modifier["id"],
                        "name_snapshot": modifier["name"],
                        "price": modifier["price"],
                    }
                    for modifier in item.get("modifiers", [])
                ],
            }
            for item in quote["items"]
        ],
    )
    append_status_history(
        order,
        OrderStatus.NEW,
        changed_by_type=ChangedByType.BOT,
        changed_by_label="Gemini Live",
    )
    db.session.add(order)
    db.session.flush()
    if order.customer:
        order.customer.last_order_at = order.created_at
    call_log.resulted_in_order = True
    return order, False
