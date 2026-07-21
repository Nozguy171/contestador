from datetime import datetime
from typing import Any

from app.extensions import db
from app.models import Customer
from app.utils.phone import normalize_phone_number


def get_or_create_customer(
    *,
    business_id: int,
    phone_number: str | None,
    name: str | None = None,
    last_call_at: datetime | None = None,
    last_order_at: datetime | None = None,
) -> Customer | None:
    normalized = normalize_phone_number(phone_number)
    if not normalized:
        return None

    customer = Customer.query.filter_by(
        business_id=business_id,
        phone_number=normalized,
    ).first()
    if not customer:
        customer = Customer(business_id=business_id, phone_number=normalized)
        db.session.add(customer)

    clean_name = (name or "").strip()
    if clean_name and (not customer.name or customer.name == "Cliente telefónico"):
        customer.name = clean_name
    if last_call_at and (not customer.last_call_at or last_call_at > customer.last_call_at):
        customer.last_call_at = last_call_at
    if last_order_at and (not customer.last_order_at or last_order_at > customer.last_order_at):
        customer.last_order_at = last_order_at
    return customer


def serialize_customer(customer: Customer) -> dict[str, Any]:
    orders = sorted(customer.orders, key=lambda item: item.created_at, reverse=True)
    calls = sorted(customer.call_logs, key=lambda item: item.start_time, reverse=True)
    total_spent = sum((order.total for order in orders), start=0)
    item_counts: dict[str, int] = {}
    for order in orders:
        for item in order.items:
            item_counts[item.name_snapshot] = item_counts.get(item.name_snapshot, 0) + item.quantity

    last_activity_candidates = [
        value
        for value in [customer.last_call_at, customer.last_order_at, customer.created_at]
        if value
    ]
    return {
        **customer.to_dict(),
        "customer_name": customer.name or "Cliente telefónico",
        "total_orders": len(orders),
        "total_calls": len(calls),
        "total_spent": str(total_spent),
        "average_order_value": str(total_spent / len(orders)) if orders else "0.00",
        "last_activity_at": max(last_activity_candidates).isoformat() if last_activity_candidates else None,
        "most_ordered_items": [
            name
            for name, _ in sorted(item_counts.items(), key=lambda item: (-item[1], item[0]))[:5]
        ],
        "addresses": list(dict.fromkeys(order.delivery_address for order in orders if order.delivery_address)),
        "order_history": orders,
    }
