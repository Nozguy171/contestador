import re
from decimal import Decimal, InvalidOperation

from flask import Blueprint, g, request
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import InventoryCategory, InventoryItem, InventoryMovement
from app.utils.auth import require_business
from app.utils.responses import error, success


bp = Blueprint("inventory", __name__, url_prefix="/api/v1/inventory")
MANUAL_MOVEMENT_TYPES = {"purchase", "waste", "correction"}


def _decimal(value, *, default=None):
    if value in (None, ""):
        return default
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


def _category(category_id):
    if category_id in (None, ""):
        return None
    try:
        return InventoryCategory.query.filter_by(
            id=int(category_id),
            business_id=g.current_business.id,
        ).first()
    except (TypeError, ValueError):
        return None


def _valid_image_url(value):
    url = str(value or "").strip()
    if not url:
        return None
    if len(url) > 2048 or not (
        url.startswith("https://")
        or url.startswith("http://")
        or url.startswith("/api/v1/uploads/")
    ):
        raise ValueError("La imagen debe ser una URL válida o un archivo subido.")
    return url


def _payload(data, *, partial=False):
    result = {}
    if not partial or "name" in data:
        name = str(data.get("name") or "").strip()
        if not name:
            raise ValueError("El nombre es obligatorio.")
        result["name"] = name[:160]
    if not partial or "unit" in data:
        unit = str(data.get("unit") or "unidad").strip().lower()
        if not unit:
            raise ValueError("La unidad es obligatoria.")
        result["unit"] = unit[:32]
    for field, default in [
        ("quantity", Decimal("0")),
        ("minimum_quantity", Decimal("0")),
        ("cost_per_unit", Decimal("0")),
    ]:
        if partial and field not in data:
            continue
        value = _decimal(data.get(field), default=default)
        if value is None:
            raise ValueError(f"{field} debe ser un número mayor o igual a cero.")
        result[field] = value
    if "category_id" in data:
        category = _category(data.get("category_id"))
        if data.get("category_id") not in (None, "") and not category:
            raise ValueError("El grupo de inventario no existe.")
        result["category_id"] = category.id if category else None
    if "image_url" in data:
        result["image_url"] = _valid_image_url(data.get("image_url"))
    for field in ["is_active", "low_stock_alert_enabled"]:
        if field in data:
            result[field] = bool(data[field])
    return result


def _serialize_item(item):
    payload = item.to_dict()
    payload["category"] = item.category.to_dict() if item.category else None
    payload["is_low_stock"] = (
        item.is_active
        and item.low_stock_alert_enabled
        and item.quantity <= item.minimum_quantity
    )
    return payload


def _record_movement(item, *, delta, movement_type, reason=None, order_id=None):
    movement = InventoryMovement(
        business_id=item.business_id,
        inventory_item_id=item.id,
        order_id=order_id,
        movement_type=movement_type,
        quantity_delta=delta,
        quantity_after=item.quantity,
        reason=(str(reason or "").strip() or None),
        changed_by_user_id=getattr(getattr(g, "current_user", None), "id", None),
        changed_by_label=getattr(getattr(g, "current_user", None), "name", None),
    )
    db.session.add(movement)
    return movement


@bp.get("/categories")
@require_business()
def list_inventory_categories():
    categories = InventoryCategory.query.filter_by(
        business_id=g.current_business.id
    ).order_by(InventoryCategory.name.asc()).all()
    payload = []
    for category in categories:
        row = category.to_dict()
        row["item_count"] = len(category.items)
        payload.append(row)
    return success(payload)


@bp.post("/categories")
@require_business("manager")
def create_inventory_category():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name") or "").strip()
    color = str(data.get("color") or "#64748b").strip()
    if not name:
        return error("El nombre del grupo es obligatorio.", 400)
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        return error("El color del grupo no es válido.", 400)
    category = InventoryCategory(
        business_id=g.current_business.id,
        name=name[:120],
        color=color.lower(),
    )
    db.session.add(category)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("Ya existe un grupo con ese nombre.", 409)
    return success(category.to_dict(), "Grupo creado.", 201)


@bp.put("/categories/<int:category_id>")
@require_business("manager")
def update_inventory_category(category_id):
    category = InventoryCategory.query.filter_by(
        id=category_id,
        business_id=g.current_business.id,
    ).first()
    if not category:
        return error("Grupo no encontrado.", 404)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = str(data.get("name") or "").strip()
        if not name:
            return error("El nombre del grupo es obligatorio.", 400)
        category.name = name[:120]
    if "color" in data:
        color = str(data.get("color") or "").strip()
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            return error("El color del grupo no es válido.", 400)
        category.color = color.lower()
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("Ya existe un grupo con ese nombre.", 409)
    return success(category.to_dict(), "Grupo actualizado.")


@bp.delete("/categories/<int:category_id>")
@require_business("manager")
def delete_inventory_category(category_id):
    category = InventoryCategory.query.filter_by(
        id=category_id,
        business_id=g.current_business.id,
    ).first()
    if not category:
        return error("Grupo no encontrado.", 404)
    db.session.delete(category)
    db.session.commit()
    return success(message="Grupo eliminado; sus artículos quedaron sin grupo.")


@bp.get("")
@require_business()
def list_inventory():
    query = InventoryItem.query.filter_by(business_id=g.current_business.id)
    if request.args.get("low_stock", "false").lower() == "true":
        query = query.filter(
            InventoryItem.is_active.is_(True),
            InventoryItem.low_stock_alert_enabled.is_(True),
            InventoryItem.quantity <= InventoryItem.minimum_quantity,
        )
    items = query.order_by(InventoryItem.is_active.desc(), InventoryItem.name.asc()).all()
    return success([_serialize_item(item) for item in items])


@bp.post("")
@require_business("manager")
def create_inventory_item():
    data = request.get_json(silent=True) or {}
    try:
        values = _payload(data)
    except ValueError as exc:
        return error(str(exc), 400)
    item = InventoryItem(business_id=g.current_business.id, **values)
    db.session.add(item)
    try:
        db.session.flush()
        _record_movement(
            item,
            delta=item.quantity,
            movement_type="initial",
            reason="Existencia inicial",
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("Ya existe un artículo con ese nombre.", 409)
    return success(_serialize_item(item), "Artículo creado.", 201)


@bp.put("/<int:item_id>")
@require_business("manager")
def update_inventory_item(item_id):
    item = InventoryItem.query.filter_by(
        id=item_id,
        business_id=g.current_business.id,
    ).with_for_update().first()
    if not item:
        return error("Artículo no encontrado.", 404)
    data = request.get_json(silent=True) or {}
    try:
        values = _payload(data, partial=True)
    except ValueError as exc:
        return error(str(exc), 400)
    previous_quantity = item.quantity
    for field, value in values.items():
        setattr(item, field, value)
    if "quantity" in values and item.quantity != previous_quantity:
        _record_movement(
            item,
            delta=item.quantity - previous_quantity,
            movement_type="correction",
            reason=data.get("reason") or "Corrección desde edición",
        )
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("Ya existe un artículo con ese nombre.", 409)
    return success(_serialize_item(item), "Artículo actualizado.")


@bp.post("/<int:item_id>/adjust")
@require_business("agent")
def adjust_inventory_item(item_id):
    item = InventoryItem.query.filter_by(
        id=item_id,
        business_id=g.current_business.id,
        is_active=True,
    ).with_for_update().first()
    if not item:
        return error("Artículo no encontrado o inactivo.", 404)
    data = request.get_json(silent=True) or {}
    try:
        delta = Decimal(str(data.get("delta")))
    except (InvalidOperation, TypeError, ValueError):
        return error("El ajuste debe ser un número.", 400)
    if delta == 0:
        return error("El ajuste no puede ser cero.", 400)
    movement_type = str(data.get("movement_type") or "correction").strip().lower()
    if movement_type not in MANUAL_MOVEMENT_TYPES:
        return error("El tipo de movimiento no es válido.", 400)
    if movement_type == "purchase" and delta < 0:
        return error("Una entrada debe aumentar las existencias.", 400)
    if movement_type == "waste" and delta > 0:
        return error("Una merma debe disminuir las existencias.", 400)
    next_quantity = item.quantity + delta
    if next_quantity < 0:
        return error(
            f"No hay suficiente existencia. Disponible: {item.quantity} {item.unit}.",
            409,
        )
    item.quantity = next_quantity
    _record_movement(
        item,
        delta=delta,
        movement_type=movement_type,
        reason=data.get("reason"),
    )
    db.session.commit()
    return success(_serialize_item(item), "Existencias actualizadas.")


@bp.get("/movements")
@require_business()
def list_inventory_movements():
    query = InventoryMovement.query.filter_by(business_id=g.current_business.id)
    item_id = request.args.get("item_id", type=int)
    if item_id is not None:
        query = query.filter_by(inventory_item_id=item_id)
    limit = min(max(request.args.get("limit", 100, type=int), 1), 500)
    movements = query.order_by(InventoryMovement.id.desc()).limit(limit).all()
    payload = []
    for movement in movements:
        row = movement.to_dict()
        row["item_name"] = movement.inventory_item.name
        row["unit"] = movement.inventory_item.unit
        row["order_folio"] = movement.order.folio if movement.order else None
        payload.append(row)
    return success(payload)
