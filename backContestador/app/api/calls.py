from datetime import datetime

from flask import Blueprint, g, request

from app.extensions import db
from app.models import CallLog, CallLogErrorFlag, CallLogToolCall, Order
from app.models.enums import CallStatus
from app.services.customers import get_or_create_customer
from app.utils.auth import require_business
from app.utils.responses import error, success

bp = Blueprint("calls", __name__, url_prefix="/api/v1/calls")


def _serialize_call(call_log):
    payload = call_log.to_dict()
    payload["order_id"] = call_log.order.id if call_log.order else None
    payload["error_flags"] = [item.to_dict() for item in call_log.error_flags]
    payload["tool_calls"] = [item.to_dict() for item in call_log.tool_calls]
    return payload


def _sync_call_order_link(call_log, order_id):
    existing_linked_order = Order.query.filter_by(call_log_id=call_log.id).first()

    if order_id is None:
        if existing_linked_order:
            existing_linked_order.call_log_id = None
        call_log.resulted_in_order = False
        return

    order = Order.query.filter_by(id=order_id, business_id=call_log.business_id).first()
    if not order:
        raise ValueError("order_id does not belong to the current business")

    if order.call_log_id and order.call_log_id != call_log.id:
        raise ValueError("order_id is already linked to another call log")

    if existing_linked_order and existing_linked_order.id != order.id:
        existing_linked_order.call_log_id = None

    order.call_log_id = call_log.id
    call_log.resulted_in_order = True


@bp.get("")
@require_business()
def list_calls():
    query = CallLog.query.filter_by(business_id=g.current_business.id)
    status = request.args.get("status")
    if status:
        query = query.filter_by(status=status)
    resulted_in_order = request.args.get("resulted_in_order")
    if resulted_in_order is not None:
        query = query.filter_by(resulted_in_order=resulted_in_order.lower() == "true")
    phone_number = request.args.get("phone_number")
    if phone_number:
        query = query.filter(CallLog.phone_number.ilike(f"%{phone_number}%"))
    items = query.order_by(CallLog.start_time.desc()).all()
    return success([_serialize_call(item) for item in items])


@bp.get("/<int:call_id>")
@require_business()
def get_call(call_id):
    item = CallLog.query.filter_by(id=call_id, business_id=g.current_business.id).first()
    if not item:
        return error("Call log not found", 404)
    return success(_serialize_call(item))


@bp.post("")
@require_business("agent")
def create_call():
    data = request.get_json(silent=True) or {}
    phone_number = (data.get("phone_number") or "").strip()
    start_time = data.get("start_time")
    status = data.get("status")
    if not phone_number or not start_time or not status:
        return error("phone_number, start_time and status are required", 400)

    item = CallLog(
        business_id=g.current_business.id,
        phone_number=phone_number,
        start_time=datetime.fromisoformat(start_time),
        end_time=datetime.fromisoformat(data["end_time"]) if data.get("end_time") else None,
        duration_seconds=data.get("duration_seconds"),
        status=CallStatus(status),
        resulted_in_order=bool(data.get("resulted_in_order", False)),
        transcript=data.get("transcript"),
        ai_summary=data.get("ai_summary"),
        confidence=data.get("confidence"),
    )
    item.customer = get_or_create_customer(
        business_id=g.current_business.id,
        phone_number=phone_number,
        last_call_at=item.start_time,
    )
    db.session.add(item)
    db.session.flush()

    for raw_flag in data.get("error_flags", []):
        db.session.add(CallLogErrorFlag(call_log_id=item.id, flag=raw_flag["flag"] if isinstance(raw_flag, dict) else raw_flag))

    for raw_tool in data.get("tool_calls", []):
        db.session.add(
            CallLogToolCall(
                call_log_id=item.id,
                tool_name=raw_tool["tool_name"],
                payload=raw_tool.get("payload"),
            )
        )

    try:
        _sync_call_order_link(item, data.get("order_id"))
    except ValueError as exc:
        db.session.rollback()
        return error(str(exc), 400)

    db.session.commit()
    return success(_serialize_call(item), "Call log created", 201)


@bp.put("/<int:call_id>")
@require_business("agent")
def update_call(call_id):
    item = CallLog.query.filter_by(id=call_id, business_id=g.current_business.id).first()
    if not item:
        return error("Call log not found", 404)

    data = request.get_json(silent=True) or {}
    for field in [
        "phone_number",
        "duration_seconds",
        "status",
        "resulted_in_order",
        "transcript",
        "ai_summary",
        "confidence",
    ]:
        if field in data:
            value = data[field]
            if field == "status":
                value = CallStatus(value)
            setattr(item, field, value)

    if "start_time" in data:
        item.start_time = datetime.fromisoformat(data["start_time"])
    if "end_time" in data:
        item.end_time = datetime.fromisoformat(data["end_time"]) if data["end_time"] else None

    if "order_id" in data:
        try:
            _sync_call_order_link(item, data.get("order_id"))
        except ValueError as exc:
            db.session.rollback()
            return error(str(exc), 400)

    if "phone_number" in data:
        item.customer = get_or_create_customer(
            business_id=item.business_id,
            phone_number=item.phone_number,
            last_call_at=item.start_time,
        )

    if "error_flags" in data:
        CallLogErrorFlag.query.filter_by(call_log_id=item.id).delete()
        for raw_flag in data.get("error_flags", []):
            db.session.add(CallLogErrorFlag(call_log_id=item.id, flag=raw_flag["flag"] if isinstance(raw_flag, dict) else raw_flag))

    if "tool_calls" in data:
        CallLogToolCall.query.filter_by(call_log_id=item.id).delete()
        for raw_tool in data.get("tool_calls", []):
            db.session.add(
                CallLogToolCall(
                    call_log_id=item.id,
                    tool_name=raw_tool["tool_name"],
                    payload=raw_tool.get("payload"),
                )
            )

    db.session.commit()
    return success(_serialize_call(item), "Call log updated")
