from flask import Blueprint, g

from app.models import Customer
from app.services.customers import serialize_customer
from app.services.orders import serialize_order
from app.utils.auth import require_business
from app.utils.responses import success

bp = Blueprint("customers", __name__, url_prefix="/api/v1/customers")


@bp.get("")
@require_business()
def list_customers():
    customers = Customer.query.filter_by(business_id=g.current_business.id).all()
    payload = []
    for customer in customers:
        row = serialize_customer(customer)
        row["order_history"] = [serialize_order(order) for order in row["order_history"]]
        payload.append(row)
    payload.sort(key=lambda item: item["last_activity_at"] or "", reverse=True)
    return success(payload)
