from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_UP
from zoneinfo import ZoneInfo

from flask import Blueprint, g

from app.models import InventoryItem, InventoryMovement, Order
from app.models.enums import OrderStatus
from app.utils.auth import require_business
from app.utils.responses import success

bp = Blueprint("insights", __name__, url_prefix="/api/v1/insights")

DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def _money(value):
    return float(Decimal(value or 0).quantize(Decimal("0.01")))


@bp.get("")
@require_business()
def get_insights():
    settings = g.current_business.settings
    enabled = bool(settings and settings.insights_enabled)
    if not enabled:
        return success(
            {
                "enabled": False,
                "sales_by_weekday": [],
                "purchase_suggestions": [],
                "recommendations": [],
                "data_window_days": 56,
            }
        )

    timezone_name = settings.timezone if settings else "UTC"
    local_zone = ZoneInfo(timezone_name)
    now = datetime.now(timezone.utc)
    local_now = now.astimezone(local_zone)
    first_sales_date = local_now.date() - timedelta(days=55)
    sales_cutoff = datetime.combine(first_sales_date, time.min, local_zone).astimezone(timezone.utc)
    orders = Order.query.filter(
        Order.business_id == g.current_business.id,
        Order.created_at >= sales_cutoff,
        Order.status != OrderStatus.CANCELLED,
    ).all()
    day_totals = defaultdict(lambda: {"orders": 0, "revenue": Decimal("0")})
    for order in orders:
        created_at = order.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        day = created_at.astimezone(local_zone).weekday()
        day_totals[day]["orders"] += 1
        day_totals[day]["revenue"] += Decimal(order.total or 0)

    occurrences = defaultdict(int)
    cursor = first_sales_date
    while cursor <= local_now.date():
        occurrences[cursor.weekday()] += 1
        cursor += timedelta(days=1)

    sales_by_weekday = []
    for index, name in enumerate(DAY_NAMES):
        count = day_totals[index]["orders"]
        divisor = occurrences[index] or 1
        sales_by_weekday.append(
            {
                "day_index": index,
                "day": name,
                "total_orders": count,
                "total_revenue": _money(day_totals[index]["revenue"]),
                "average_orders": round(count / divisor, 1),
                "average_revenue": _money(day_totals[index]["revenue"] / divisor),
            }
        )

    inventory_cutoff = now - timedelta(days=28)
    movements = InventoryMovement.query.filter(
        InventoryMovement.business_id == g.current_business.id,
        InventoryMovement.created_at >= inventory_cutoff,
        InventoryMovement.movement_type == "sale",
    ).all()
    consumed = defaultdict(lambda: Decimal("0"))
    for movement in movements:
        consumed[movement.inventory_item_id] += abs(Decimal(movement.quantity_delta))
    items = {
        item.id: item
        for item in InventoryItem.query.filter_by(
            business_id=g.current_business.id,
            is_active=True,
        ).all()
    }
    purchase_suggestions = []
    for item_id, used in consumed.items():
        item = items.get(item_id)
        if not item or used <= 0:
            continue
        daily = used / Decimal("28")
        target = daily * Decimal("7") * Decimal("1.20")
        suggested = max(Decimal("0"), target - Decimal(item.quantity))
        remaining_days = Decimal(item.quantity) / daily if daily else None
        if suggested > 0:
            purchase_suggestions.append(
                {
                    "item_id": item.id,
                    "name": item.name,
                    "unit": item.unit,
                    "current_quantity": float(item.quantity),
                    "consumed_28_days": float(used),
                    "average_daily_use": float(daily.quantize(Decimal("0.001"))),
                    "estimated_days_remaining": float(remaining_days.quantize(Decimal("0.1"))) if remaining_days is not None else None,
                    "recommended_purchase": float(suggested.quantize(Decimal("0.001"), rounding=ROUND_UP)),
                }
            )
    purchase_suggestions.sort(key=lambda item: item["estimated_days_remaining"] or 999999)

    recommendations = []
    if len(orders) >= 10:
        active_days = [item for item in sales_by_weekday if item["total_orders"] > 0]
        if active_days:
            lowest = min(active_days, key=lambda item: item["average_revenue"])
            highest = max(active_days, key=lambda item: item["average_revenue"])
            if lowest["day_index"] != highest["day_index"]:
                recommendations.append(
                    {
                        "kind": "promotion",
                        "title": f"Refuerza los {lowest['day'].lower()}",
                        "message": (
                            f"Promedias ${lowest['average_revenue']:.2f} ese día frente a "
                            f"${highest['average_revenue']:.2f} en {highest['day'].lower()}. "
                            "Prueba una promoción limitada y compara el resultado durante cuatro semanas."
                        ),
                        "confidence": "medium" if len(orders) < 30 else "high",
                        "action_href": "/promotions",
                        "suggested_day": lowest["day_index"],
                    }
                )
    else:
        recommendations.append(
            {
                "kind": "learning",
                "title": "Todavía estamos aprendiendo",
                "message": f"Hay {len(orders)} pedidos útiles. Con 10 o más podremos detectar días de venta baja.",
                "confidence": "learning",
                "action_href": "/pos",
            }
        )
    if purchase_suggestions:
        recommendations.append(
            {
                "kind": "inventory",
                "title": "Planea tu siguiente compra",
                "message": f"Detectamos {len(purchase_suggestions)} insumos que podrían no cubrir la próxima semana con 20% de colchón.",
                "confidence": "medium",
                "action_href": "/inventory",
            }
        )

    return success(
        {
            "enabled": True,
            "sales_by_weekday": sales_by_weekday,
            "purchase_suggestions": purchase_suggestions[:20],
            "recommendations": recommendations,
            "sample_size": len(orders),
            "data_window_days": 56,
            "inventory_window_days": 28,
            "generated_at": now.isoformat(),
        }
    )
