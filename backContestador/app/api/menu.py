from decimal import Decimal, InvalidOperation

from flask import Blueprint, g, request
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import (
    Category,
    InventoryItem,
    MenuRule,
    Product,
    ProductIngredient,
    ProductModifier,
)
from app.models.enums import MenuRuleType
from app.utils.auth import require_business
from app.utils.responses import error, success

bp = Blueprint("menu", __name__, url_prefix="/api/v1/menu")


def _parse_price(value):
    try:
        price = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return price if price >= 0 else None


def _normalize_modifiers(raw_modifiers):
    if not isinstance(raw_modifiers, list):
        return None
    normalized = []
    for raw_modifier in raw_modifiers:
        if not isinstance(raw_modifier, dict):
            return None
        name = str(raw_modifier.get("name") or "").strip()
        group_name = str(raw_modifier.get("group_name") or "Personalización").strip()
        action = str(raw_modifier.get("action") or "choice").strip().lower()
        price = _parse_price(raw_modifier.get("price", 0))
        try:
            sort_order = int(raw_modifier.get("sort_order", 0))
        except (TypeError, ValueError):
            return None
        if not name or not group_name or action not in {"choice", "add", "remove"} or price is None:
            return None
        if action == "remove" and price != 0:
            return None
        normalized.append(
            {
                "name": name,
                "group_name": group_name,
                "action": action,
                "price": price,
                "is_active": bool(raw_modifier.get("is_active", True)),
                "sort_order": sort_order,
            }
        )
    return normalized


def _normalize_ingredients(raw_ingredients):
    if not isinstance(raw_ingredients, list):
        return None
    normalized = []
    seen = set()
    for raw_ingredient in raw_ingredients:
        if not isinstance(raw_ingredient, dict):
            return None
        try:
            inventory_item_id = int(raw_ingredient.get("inventory_item_id"))
            quantity = Decimal(str(raw_ingredient.get("quantity")))
        except (InvalidOperation, TypeError, ValueError):
            return None
        if quantity <= 0 or inventory_item_id in seen:
            return None
        inventory_item = InventoryItem.query.filter_by(
            id=inventory_item_id,
            business_id=g.current_business.id,
        ).first()
        if not inventory_item:
            return None
        seen.add(inventory_item_id)
        normalized.append(
            {
                "inventory_item_id": inventory_item_id,
                "quantity": quantity,
            }
        )
    return normalized


def _serialize_product(item):
    row = item.to_dict()
    row["modifiers"] = [modifier.to_dict() for modifier in item.modifiers]
    row["ingredients"] = [
        {
            **ingredient.to_dict(),
            "inventory_item_name": ingredient.inventory_item.name,
            "unit": ingredient.inventory_item.unit,
        }
        for ingredient in item.ingredients
    ]
    return row


def _image_url(value):
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


def _category_belongs_to_business(category_id):
    if category_id in (None, ""):
        return True
    try:
        return Category.query.filter_by(id=int(category_id), business_id=g.current_business.id).first() is not None
    except (TypeError, ValueError):
        return False


def _availability_is_valid(is_active, is_sold_out):
    return not (bool(is_active) and bool(is_sold_out))


@bp.get("/categories")
@require_business()
def list_categories():
    items = Category.query.filter_by(business_id=g.current_business.id).order_by(Category.sort_order.asc(), Category.id.asc()).all()
    payload = []
    for item in items:
        row = item.to_dict()
        row["product_count"] = Product.query.filter_by(category_id=item.id).count()
        payload.append(row)
    return success(payload)


@bp.post("/categories")
@require_business("manager")
def create_category():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return error("El nombre de la categoría es obligatorio.", 400)
    item = Category(
        business_id=g.current_business.id,
        name=name,
        description=data.get("description"),
        sort_order=int(data.get("sort_order", 0)),
        is_active=bool(data.get("is_active", True)),
    )
    db.session.add(item)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("Ya existe una categoría con ese nombre.", 409)
    return success(item.to_dict(), "Categoría creada.", 201)


@bp.put("/categories/<int:category_id>")
@require_business("manager")
def update_category(category_id):
    item = Category.query.filter_by(id=category_id, business_id=g.current_business.id).first()
    if not item:
        return error("Categoría no encontrada.", 404)
    data = request.get_json(silent=True) or {}
    for field in ["name", "description", "sort_order", "is_active"]:
        if field in data:
            setattr(item, field, data[field])
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error("Ya existe una categoría con ese nombre.", 409)
    return success(item.to_dict(), "Categoría actualizada.")


@bp.delete("/categories/<int:category_id>")
@require_business("manager")
def delete_category(category_id):
    item = Category.query.filter_by(id=category_id, business_id=g.current_business.id).first()
    if not item:
        return error("Categoría no encontrada.", 404)
    db.session.delete(item)
    db.session.commit()
    return success(message="Categoría eliminada.")


@bp.get("/products")
@require_business()
def list_products():
    query = Product.query.filter_by(business_id=g.current_business.id)
    category_id = request.args.get("category_id", type=int)
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"

    if category_id is not None:
        query = query.filter_by(category_id=category_id)
    if not include_inactive:
        query = query.filter_by(is_active=True)

    items = query.order_by(Product.id.desc()).all()
    payload = []
    for item in items:
        payload.append(_serialize_product(item))
    return success(payload)


@bp.post("/products")
@require_business("manager")
def create_product():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    price = _parse_price(data.get("price"))
    if not name or price is None:
        return error("El nombre y un precio mayor o igual a cero son obligatorios.", 400)
    if not _category_belongs_to_business(data.get("category_id")):
        return error("La categoría seleccionada no pertenece a este negocio.", 400)
    modifiers = _normalize_modifiers(data.get("modifiers", []))
    if modifiers is None:
        return error("Revisa el nombre, grupo, acción y precio de las personalizaciones.", 400)
    ingredients = _normalize_ingredients(data.get("ingredients", []))
    if ingredients is None:
        return error("La receta contiene ingredientes o cantidades inválidas.", 400)
    try:
        image_url = _image_url(data.get("image_url"))
    except ValueError as exc:
        return error(str(exc), 400)

    item = Product(
        business_id=g.current_business.id,
        category_id=data.get("category_id"),
        name=name,
        description=data.get("description"),
        price=price,
        image_url=image_url,
        is_active=bool(data.get("is_active", True)),
        is_sold_out=bool(data.get("is_sold_out", False)),
    )
    if not _availability_is_valid(item.is_active, item.is_sold_out):
        return error("Un producto no puede estar disponible y agotado al mismo tiempo.", 400)
    db.session.add(item)
    db.session.flush()

    for raw_modifier in modifiers:
        item.modifiers.append(
            ProductModifier(
                name=raw_modifier["name"],
                group_name=raw_modifier["group_name"],
                action=raw_modifier["action"],
                price=raw_modifier.get("price", 0),
                is_active=raw_modifier.get("is_active", True),
                sort_order=raw_modifier.get("sort_order", 0),
            )
        )

    for raw_ingredient in ingredients:
        item.ingredients.append(ProductIngredient(**raw_ingredient))

    db.session.commit()
    return success(_serialize_product(item), "Producto creado.", 201)


@bp.put("/products/<int:product_id>")
@require_business("manager")
def update_product(product_id):
    item = Product.query.filter_by(id=product_id, business_id=g.current_business.id).first()
    if not item:
        return error("Producto no encontrado.", 404)

    data = request.get_json(silent=True) or {}
    if "name" in data and not str(data.get("name") or "").strip():
        return error("El nombre del producto no puede quedar vacío.", 400)
    if "price" in data:
        price = _parse_price(data["price"])
        if price is None:
            return error("El precio debe ser mayor o igual a cero.", 400)
        data["price"] = price
    if "category_id" in data and not _category_belongs_to_business(data["category_id"]):
        return error("La categoría seleccionada no pertenece a este negocio.", 400)
    modifiers = None
    if "modifiers" in data:
        modifiers = _normalize_modifiers(data["modifiers"])
        if modifiers is None:
            return error("Revisa el nombre, grupo, acción y precio de las personalizaciones.", 400)
    ingredients = None
    if "ingredients" in data:
        ingredients = _normalize_ingredients(data["ingredients"])
        if ingredients is None:
            return error("La receta contiene ingredientes o cantidades inválidas.", 400)
    if "image_url" in data:
        try:
            data["image_url"] = _image_url(data.get("image_url"))
        except ValueError as exc:
            return error(str(exc), 400)
    for field in ["category_id", "name", "description", "price", "image_url", "is_active", "is_sold_out"]:
        if field in data:
            setattr(item, field, data[field])

    if not _availability_is_valid(item.is_active, item.is_sold_out):
        return error("Un producto no puede estar disponible y agotado al mismo tiempo.", 400)

    if "modifiers" in data:
        ProductModifier.query.filter_by(product_id=item.id).delete()
        for raw_modifier in modifiers or []:
            db.session.add(
                ProductModifier(
                    product_id=item.id,
                    name=raw_modifier["name"],
                    group_name=raw_modifier["group_name"],
                    action=raw_modifier["action"],
                    price=raw_modifier.get("price", 0),
                    is_active=raw_modifier.get("is_active", True),
                    sort_order=raw_modifier.get("sort_order", 0),
                )
            )

    if "ingredients" in data:
        ProductIngredient.query.filter_by(product_id=item.id).delete()
        for raw_ingredient in ingredients or []:
            db.session.add(ProductIngredient(product_id=item.id, **raw_ingredient))

    db.session.commit()
    return success(_serialize_product(item), "Producto actualizado.")


@bp.delete("/products/<int:product_id>")
@require_business("manager")
def delete_product(product_id):
    item = Product.query.filter_by(id=product_id, business_id=g.current_business.id).first()
    if not item:
        return error("Producto no encontrado.", 404)
    db.session.delete(item)
    db.session.commit()
    return success(message="Producto eliminado.")


@bp.get("/rules")
@require_business()
def list_rules():
    items = MenuRule.query.filter_by(business_id=g.current_business.id).order_by(MenuRule.id.desc()).all()
    return success([item.to_dict() for item in items])


@bp.post("/rules")
@require_business("manager")
def create_rule():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    rule_type = data.get("type")
    if not name or not rule_type:
        return error("name and type are required", 400)

    item = MenuRule(
        business_id=g.current_business.id,
        name=name,
        type=MenuRuleType(rule_type),
        description=data.get("description"),
        is_active=bool(data.get("is_active", True)),
        config=data.get("config", {}),
    )
    db.session.add(item)
    db.session.commit()
    return success(item.to_dict(), "Rule created", 201)


@bp.put("/rules/<int:rule_id>")
@require_business("manager")
def update_rule(rule_id):
    item = MenuRule.query.filter_by(id=rule_id, business_id=g.current_business.id).first()
    if not item:
        return error("Rule not found", 404)
    data = request.get_json(silent=True) or {}
    for field in ["name", "type", "description", "is_active", "config"]:
        if field in data:
            value = data[field]
            if field == "type":
                value = MenuRuleType(value)
            setattr(item, field, value)
    db.session.commit()
    return success(item.to_dict(), "Rule updated")


@bp.delete("/rules/<int:rule_id>")
@require_business("manager")
def delete_rule(rule_id):
    item = MenuRule.query.filter_by(id=rule_id, business_id=g.current_business.id).first()
    if not item:
        return error("Rule not found", 404)
    db.session.delete(item)
    db.session.commit()
    return success(message="Rule deleted")
