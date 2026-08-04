from collections import defaultdict
from decimal import Decimal

from app.extensions import db
from app.models import InventoryItem, InventoryMovement, Product


class InventoryStockError(ValueError):
    pass


def _order_requirements(order):
    requirements = defaultdict(lambda: Decimal("0"))
    for order_item in order.items:
        if not order_item.product_id:
            continue
        product = db.session.get(Product, order_item.product_id)
        if not product:
            continue
        for ingredient in product.ingredients:
            requirements[ingredient.inventory_item_id] += (
                ingredient.quantity * order_item.quantity
            )
    return requirements


def consume_order_inventory(order, *, changed_by_user_id=None, changed_by_label=None):
    existing = InventoryMovement.query.filter_by(
        business_id=order.business_id,
        order_id=order.id,
        movement_type="sale",
    ).first()
    if existing:
        return

    requirements = _order_requirements(order)
    if not requirements:
        return
    items = {
        item.id: item
        for item in InventoryItem.query.filter(
            InventoryItem.business_id == order.business_id,
            InventoryItem.id.in_(requirements),
        ).with_for_update().all()
    }
    shortages = []
    for item_id, required in requirements.items():
        item = items.get(item_id)
        if not item or item.quantity < required:
            available = item.quantity if item else Decimal("0")
            name = item.name if item else f"Ingrediente {item_id}"
            unit = item.unit if item else ""
            shortages.append(f"{name}: faltan {required - available:g} {unit}".strip())
    if shortages:
        raise InventoryStockError(
            "No se puede confirmar por inventario insuficiente: " + ", ".join(shortages)
        )

    for item_id, required in requirements.items():
        item = items[item_id]
        item.quantity -= required
        db.session.add(
            InventoryMovement(
                business_id=order.business_id,
                inventory_item_id=item.id,
                order_id=order.id,
                movement_type="sale",
                quantity_delta=-required,
                quantity_after=item.quantity,
                reason=f"Consumo por pedido {order.folio}",
                changed_by_user_id=changed_by_user_id,
                changed_by_label=changed_by_label,
            )
        )


def reverse_order_inventory(order, *, changed_by_user_id=None, changed_by_label=None):
    sales = InventoryMovement.query.filter_by(
        business_id=order.business_id,
        order_id=order.id,
        movement_type="sale",
    ).all()
    if not sales:
        return
    reversed_item_ids = {
        movement.inventory_item_id
        for movement in InventoryMovement.query.filter_by(
            business_id=order.business_id,
            order_id=order.id,
            movement_type="reversal",
        ).all()
    }
    item_ids = [movement.inventory_item_id for movement in sales if movement.inventory_item_id not in reversed_item_ids]
    if not item_ids:
        return
    items = {
        item.id: item
        for item in InventoryItem.query.filter(InventoryItem.id.in_(item_ids)).with_for_update().all()
    }
    for sale in sales:
        if sale.inventory_item_id in reversed_item_ids:
            continue
        item = items.get(sale.inventory_item_id)
        if not item:
            continue
        restored = -sale.quantity_delta
        item.quantity += restored
        db.session.add(
            InventoryMovement(
                business_id=order.business_id,
                inventory_item_id=item.id,
                order_id=order.id,
                movement_type="reversal",
                quantity_delta=restored,
                quantity_after=item.quantity,
                reason=f"Devolución por cancelación de {order.folio}",
                changed_by_user_id=changed_by_user_id,
                changed_by_label=changed_by_label,
            )
        )


def apply_order_inventory_transition(
    order,
    new_status,
    *,
    changed_by_user_id=None,
    changed_by_label=None,
):
    if new_status == "cancelled":
        reverse_order_inventory(
            order,
            changed_by_user_id=changed_by_user_id,
            changed_by_label=changed_by_label,
        )
    elif new_status not in {"new"}:
        consume_order_inventory(
            order,
            changed_by_user_id=changed_by_user_id,
            changed_by_label=changed_by_label,
        )
