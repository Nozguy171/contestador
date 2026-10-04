from datetime import datetime

from flask import Blueprint, g, request
from sqlalchemy.orm import selectinload

from app.extensions import db
from app.models import CallLog, CallLogErrorFlag, CallLogToolCall, CallLogTranscriptEvent, Order
from app.models.enums import CallStatus
from app.services.customers import get_or_create_customer
from app.utils.auth import require_business
from app.utils.responses import error, success

bp = Blueprint("calls", __name__, url_prefix="/api/v1/calls")


def _serialize_call(call_log):
    payload = call_log.to_dict(exclude={"draft_cart"})
    draft = call_log.draft_cart if isinstance(call_log.draft_cart, dict) else {}
    quote = dict(draft.get("quote") or {})
    for key in ("delivery_address", "delivery_address_components", "customer_name", "notes"):
        quote.pop(key, None)
    payload["draft_cart"] = {
        "version": draft.get("version"),
        "revision": draft.get("revision", 0),
        "items": draft.get("items", []),
        "unavailable_items": draft.get("unavailable_items", []),
        "quote": quote or None,
    }
    payload["tool_calls"] = [
        {"tool_name": item.tool_name, "payload": _redact_sensitive(item.payload)}
        for item in call_log.tool_calls
    ]
    payload["order_id"] = call_log.order.id if call_log.order else None
    payload["error_flags"] = [item.to_dict() for item in call_log.error_flags]
    payload["voice_metrics"] = call_log.voice_metrics or {}
    role = getattr(getattr(g.current_membership, "role", None), "value", None)
    return _redact_call_for_role(payload, role)


def _redact_call_for_role(payload, role):
    if role != "viewer":
        return payload
    digits = "".join(char for char in str(payload.get("phone_number") or "") if char.isdigit())
    payload["phone_number"] = f"••••{digits[-4:]}" if digits else "Privado"
    payload["transcript"] = None
    payload["ai_summary"] = None
    draft = payload.get("draft_cart") or {}
    payload["draft_cart"] = {
        "version": draft.get("version"),
        "revision": draft.get("revision", 0),
        "items": [],
        "unavailable_items": [],
        "quote": None,
    }
    payload["tool_calls"] = []
    return payload


def _viewer_phone_search_suffix(value):
    digits = "".join(char for char in str(value or "") if char.isdigit())
    return digits[-4:] if len(digits) >= 4 else None


def _redact_sensitive(value):
    sensitive = {
        "confirmation_token", "customer_name", "delivery_address", "delivery_address_parts",
        "phone_number", "street", "number", "interior_number", "colony", "city",
        "postal_code", "references", "street_name", "settlement_name", "locality_name",
        "canonical_address", "delivery_address_components", "delivery_street_type",
        "delivery_street_name", "delivery_exterior_number", "delivery_interior_number",
        "delivery_settlement_type", "delivery_settlement_name", "delivery_postal_code",
        "delivery_locality", "delivery_municipality", "delivery_state", "delivery_country",
        "delivery_references",
    }
    if isinstance(value, dict):
        return {
            key: "[redacted]" if str(key).casefold() in sensitive else _redact_sensitive(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_sensitive(item) for item in value]
    return value


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
        if g.current_membership.role.value == "viewer":
            suffix = _viewer_phone_search_suffix(phone_number)
            if suffix is None:
                return error("Para buscar llamadas como viewer, indica al menos los últimos cuatro dígitos.", 400)
            query = query.filter(CallLog.phone_number.ilike(f"%{suffix}"))
        else:
            query = query.filter(CallLog.phone_number.ilike(f"%{phone_number}%"))
    limit = max(1, min(request.args.get("limit", default=100, type=int), 200))
    offset = max(0, request.args.get("offset", default=0, type=int))
    total = query.count()
    items = (
        query.options(
            selectinload(CallLog.order),
            selectinload(CallLog.error_flags),
            selectinload(CallLog.tool_calls),
        )
        .order_by(CallLog.start_time.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return success({"items": [_serialize_call(item) for item in items], "total": total})


@bp.get("/<int:call_id>")
@require_business()
def get_call(call_id):
    item = CallLog.query.filter_by(id=call_id, business_id=g.current_business.id).first()
    if not item:
        return error("Call log not found", 404)
    return success(_serialize_call(item))


@bp.get("/<int:call_id>/voice-events")
@require_business("manager")
def list_voice_events(call_id):
    call_log = CallLog.query.filter_by(id=call_id, business_id=g.current_business.id).first()
    if not call_log:
        return error("Call log not found", 404)
    event_query = CallLogTranscriptEvent.query.filter_by(call_log_id=call_log.id)
    total_events = event_query.count()
    items = list(reversed(
        event_query.order_by(CallLogTranscriptEvent.receive_sequence.desc())
        .limit(1000)
        .all()
    ))
    return success({
        "model": call_log.gemini_model,
        "metrics": call_log.voice_metrics or {},
        "transcript_events": [item.to_dict() for item in items],
        "total_events": total_events,
        "truncated": total_events > len(items),
    })


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
