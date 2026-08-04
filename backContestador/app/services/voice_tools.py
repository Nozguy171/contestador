from __future__ import annotations

import secrets
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import or_

from app.models import CallLogToolCall, Category, Product
from app.services.orders import (
    OrderValidationError,
    quote_voice_order,
    submit_voice_order,
)
from app.utils.phone import normalize_phone_number


VOICE_FUNCTION_DECLARATIONS: list[dict[str, Any]] = [
    {
        "name": "search_menu",
        "description": "Busca productos activos del menú del negocio actual. No calcula el pedido.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Producto o categoría a buscar."}
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_item_options",
        "description": "Obtiene precio, disponibilidad y modificadores vigentes de un producto.",
        "parameters": {
            "type": "object",
            "properties": {"id": {"type": "integer", "description": "ID del producto."}},
            "required": ["id"],
        },
    },
    {
        "name": "add_to_cart",
        "description": (
            "Agrega al carrito preliminar un producto validado por el backend. "
            "Llámala inmediatamente después de conocer el producto y la cantidad; "
            "no digas que quedó agregado sin recibir ok=true."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "id": {"type": "integer", "description": "ID del producto."},
                "qty": {"type": "integer", "minimum": 1, "maximum": 99},
                "modifiers": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "IDs de modificadores confirmados; usa una lista vacía si no hay.",
                },
            },
            "required": ["id", "qty", "modifiers"],
        },
    },
    {
        "name": "get_cart",
        "description": "Consulta el carrito real de esta llamada. Úsala antes de cotizar o si crees que falta un producto.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "remove_item",
        "description": "Elimina una línea del carrito preliminar usando el line_id devuelto al agregarla.",
        "parameters": {
            "type": "object",
            "properties": {"id": {"type": "string", "description": "line_id del carrito."}},
            "required": ["id"],
        },
    },
    {
        "name": "quote_order",
        "description": (
            "Valida el carrito y calcula precios, entrega y total en el backend. "
            "Su resultado debe leerse al cliente antes de pedir confirmación explícita."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "customer_name": {"type": "string"},
                "order_type": {"type": "string", "enum": ["pickup", "delivery"]},
                "payment_method": {"type": "string", "enum": ["cash", "card", "online"]},
                "delivery_address": {
                    "type": "string",
                    "description": "Compatibilidad anterior. Para delivery usa delivery_address_parts.",
                },
                "delivery_address_parts": {
                    "type": "object",
                    "description": "Usa estos campos para delivery y no una sola cadena larga.",
                    "properties": {
                        "street": {"type": "string", "description": "Calle o avenida."},
                        "number": {"type": "string", "description": "Número exterior."},
                        "colony": {"type": "string", "description": "Colonia o fraccionamiento."},
                        "city": {"type": "string", "description": "Ciudad."},
                        "references": {"type": "string", "description": "Referencias; usa sin referencias si no tiene."},
                    },
                    "required": ["street", "number", "colony", "city"],
                },
                "notes": {"type": "string"},
            },
            "required": ["customer_name", "order_type", "payment_method"],
        },
    },
    {
        "name": "submit_order",
        "description": (
            "Crea exactamente un pedido después de que el cliente confirmó explícitamente la cotización vigente."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "confirmation_token": {"type": "string"},
                "confirmed": {
                    "type": "boolean",
                    "description": "Debe ser true sólo después de oír una confirmación explícita del cliente.",
                },
            },
            "required": ["confirmation_token", "confirmed"],
        },
    },
    {
        "name": "transfer_to_human",
        "description": "Transfiere la llamada al número humano configurado para este negocio.",
        "parameters": {
            "type": "object",
            "properties": {"reason": {"type": "string"}},
        },
    },
]


def _money(value: Decimal | str | int | float) -> str:
    return f"{Decimal(str(value)):.2f}"


def _modifier_label(modifier) -> str:
    if modifier.action == "remove":
        return f"Sin {modifier.name}"
    if modifier.action == "add":
        return f"Agregar {modifier.name}"
    return modifier.name


def _product_payload(product: Product) -> dict[str, Any]:
    return {
        "id": product.id,
        "name": product.name,
        "description": product.description,
        "price": _money(product.price),
        "is_sold_out": product.is_sold_out,
        "category": product.category.name if product.category else None,
        "modifiers": [
            {
                "id": item.id,
                "name": item.name,
                "label": _modifier_label(item),
                "group": item.group_name,
                "action": item.action,
                "price": _money(item.price),
            }
            for item in sorted(product.modifiers, key=lambda row: (row.sort_order, row.id))
            if item.is_active
        ],
    }


class OrderTools:
    def __init__(self, *, session, business, call_log, twilio_adapter) -> None:
        self.session = session
        self.business = business
        self.call_log = call_log
        self.twilio_adapter = twilio_adapter

    def execute(self, tool_name: str, arguments: dict[str, Any] | None) -> dict[str, Any]:
        args = arguments or {}
        handlers = {
            "search_menu": self._search_menu,
            "get_item_options": self._get_item_options,
            "get_cart": self._get_cart,
            "add_to_cart": self._add_to_cart,
            "remove_item": self._remove_item,
            "quote_order": self._quote_order,
            "submit_order": self._submit_order,
            "transfer_to_human": self._transfer_to_human,
        }
        handler = handlers.get(tool_name)
        if not handler:
            return {"ok": False, "error": f"La herramienta {tool_name} no existe."}
        try:
            return handler(args)
        except OrderValidationError as exc:
            return {"ok": False, "error": str(exc)}

    def _search_menu(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query") or "").strip()
        normalized_query = query.casefold().strip(" ¿?¡!")
        if normalized_query in {
            "menu",
            "menú",
            "productos",
            "que tienen",
            "qué tienen",
            "que hay",
            "qué hay",
            "todo",
        }:
            query = ""
        products = Product.query.filter_by(
            business_id=self.session.tenant_id,
            is_active=True,
        ).outerjoin(Category, Product.category_id == Category.id)
        if query:
            products = products.filter(
                or_(
                    Product.name.ilike(f"%{query}%"),
                    Product.description.ilike(f"%{query}%"),
                    Category.name.ilike(f"%{query}%"),
                )
            )
        return {
            "ok": True,
            "query": query,
            "items": [_product_payload(item) for item in products.order_by(Product.name).limit(12).all()],
        }

    def _product(self, raw_id: Any) -> Product:
        try:
            product_id = int(raw_id)
        except (TypeError, ValueError) as exc:
            raise OrderValidationError("El ID de producto es inválido.") from exc
        product = Product.query.filter_by(
            id=product_id,
            business_id=self.session.tenant_id,
            is_active=True,
        ).first()
        if not product or product.is_sold_out:
            raise OrderValidationError("Ese producto no está disponible.")
        return product

    def _get_item_options(self, args: dict[str, Any]) -> dict[str, Any]:
        return {"ok": True, "item": _product_payload(self._product(args.get("id")))}

    def _get_cart(self, args: dict[str, Any]) -> dict[str, Any]:
        del args
        return {"ok": True, "cart": self._cart_summary()}

    def _add_to_cart(self, args: dict[str, Any]) -> dict[str, Any]:
        product = self._product(args.get("id"))
        try:
            quantity = int(args.get("qty"))
            modifier_ids = [int(value) for value in (args.get("modifiers") or [])]
        except (TypeError, ValueError) as exc:
            raise OrderValidationError("La cantidad o los modificadores son inválidos.") from exc
        if quantity < 1 or quantity > 99:
            raise OrderValidationError("La cantidad debe estar entre 1 y 99.")
        if len(modifier_ids) != len(set(modifier_ids)):
            raise OrderValidationError("No repitas el mismo modificador.")

        modifier_map = {
            item.id: item
            for item in product.modifiers
            if item.is_active and item.id in modifier_ids
        }
        if len(modifier_map) != len(modifier_ids):
            raise OrderValidationError(f"Hay modificadores inválidos para {product.name}.")
        choice_groups = set()
        for item in modifier_map.values():
            if item.action != "choice":
                continue
            if item.group_name in choice_groups:
                raise OrderValidationError(
                    f"Sólo puedes elegir una opción de {item.group_name} para {product.name}."
                )
            choice_groups.add(item.group_name)
        modifiers = [
            {
                "id": item.id,
                "name": _modifier_label(item),
                "group": item.group_name,
                "action": item.action,
                "price": _money(item.price),
            }
            for item in sorted(modifier_map.values(), key=lambda row: (row.sort_order, row.id))
        ]
        modifier_total = sum((Decimal(item["price"]) for item in modifiers), Decimal("0.00"))

        matching = next(
            (
                item
                for item in self.session.cart
                if item.get("product_id") == product.id
                and item.get("modifier_ids", []) == modifier_ids
            ),
            None,
        )
        if matching:
            quantity += int(matching["quantity"])
            if quantity > 99:
                raise OrderValidationError("La cantidad acumulada no puede exceder 99.")
            matching["quantity"] = quantity
            matching["line_total"] = _money((product.price + modifier_total) * quantity)
            line = matching
        else:
            line = {
                "line_id": uuid4().hex[:12],
                "product_id": product.id,
                "name": product.name,
                "quantity": quantity,
                "unit_price": _money(product.price),
                "modifier_ids": modifier_ids,
                "modifiers": modifiers,
                "line_total": _money((product.price + modifier_total) * quantity),
            }
            self.session.cart.append(line)
        self.session.cart_changed()
        self._persist()
        return {"ok": True, "added": line, "cart": self._cart_summary()}

    def _remove_item(self, args: dict[str, Any]) -> dict[str, Any]:
        line_id = str(args.get("id") or "").strip()
        if not line_id:
            raise OrderValidationError("Falta el line_id del carrito.")
        before = len(self.session.cart)
        self.session.cart = [item for item in self.session.cart if str(item.get("line_id")) != line_id]
        if len(self.session.cart) == before:
            raise OrderValidationError("Esa línea ya no existe en el carrito.")
        self.session.cart_changed()
        self._persist()
        return {"ok": True, "removed_line_id": line_id, "cart": self._cart_summary()}

    def _quote_order(self, args: dict[str, Any]) -> dict[str, Any]:
        if not self.session.cart:
            return {
                "ok": False,
                "error": "No hay productos agregados todavía; no se perdió ningún pedido. Agrega el producto y la cantidad antes de cotizar.",
                "cart": self._cart_summary(),
            }

        address_parts = args.get("delivery_address_parts")
        if isinstance(address_parts, dict):
            labels = {
                "street": "la calle",
                "number": "el número",
                "colony": "la colonia",
                "city": "la ciudad",
            }
            missing = [label for key, label in labels.items() if not str(address_parts.get(key) or "").strip()]
            if missing:
                raise OrderValidationError(f"Falta confirmar {', '.join(missing)}.")
            delivery_address = (
                f"{str(address_parts['street']).strip()} {str(address_parts['number']).strip()}, "
                f"colonia {str(address_parts['colony']).strip()}, {str(address_parts['city']).strip()}"
            )
            references = str(address_parts.get("references") or "").strip()
            if references:
                delivery_address += f". Referencias: {references}"
        else:
            delivery_address = str(args.get("delivery_address") or "").strip() or None

        self.session.checkout = {
            "customer_name": str(args.get("customer_name") or "").strip(),
            "order_type": str(args.get("order_type") or "").strip(),
            "payment_method": str(args.get("payment_method") or "").strip(),
            "delivery_address": delivery_address,
            "notes": str(args.get("notes") or "").strip() or None,
        }
        quote = quote_voice_order(
            business=self.business,
            cart=self.session.cart,
            checkout=self.session.checkout,
        )
        token = secrets.token_urlsafe(12)
        self.session.set_quote(quote, token)
        self._persist()
        return {
            "ok": True,
            **quote,
            "confirmation_token": token,
            "requires_explicit_confirmation": True,
            "instruction": "Lee el resumen y total; pregunta si confirma. No envíes aún el pedido.",
        }

    def _submit_order(self, args: dict[str, Any]) -> dict[str, Any]:
        if args.get("confirmed") is not True:
            raise OrderValidationError("Se requiere una confirmación explícita del cliente.")
        if not self.session.quote_is_current:
            raise OrderValidationError("La cotización venció; vuelve a cotizar el carrito.")
        if not secrets.compare_digest(
            str(args.get("confirmation_token") or ""),
            str(self.session.confirmation_token),
        ):
            raise OrderValidationError("El token de confirmación no corresponde a la cotización vigente.")

        current_quote = quote_voice_order(
            business=self.business,
            cart=self.session.cart,
            checkout=self.session.checkout,
        )
        if current_quote != self.session.quoted_order:
            self.session.cart_changed()
            self._persist()
            raise OrderValidationError("El menú o el total cambió; vuelve a cotizar y confirma de nuevo.")

        order, already_created = submit_voice_order(
            business=self.business,
            call_log=self.call_log,
            caller_phone=self.session.caller_phone,
            quote=current_quote,
        )
        self.session.state = "order_submitted"
        self.session.hangup_after_response = True
        self._persist()
        return {
            "ok": True,
            "order_id": order.id,
            "folio": order.folio,
            "total": _money(order.total),
            "already_created": already_created,
        }

    def _transfer_to_human(self, args: dict[str, Any]) -> dict[str, Any]:
        target = normalize_phone_number(self.business.human_transfer_number)
        twilio_number = normalize_phone_number(self.business.twilio_phone_number)
        if not target:
            raise OrderValidationError("Este negocio no tiene un número humano configurado.")
        if target == twilio_number:
            raise OrderValidationError("El número humano no puede ser el mismo número de Twilio.")

        self.session.transfer_requested = True
        self.session.state = "transferring"
        self._persist()
        self.twilio_adapter.transfer_to_human(
            call_sid=self.session.call_sid,
            phone_number=target,
        )
        return {"ok": True, "transferring": True, "reason": str(args.get("reason") or "")[:160]}

    def _cart_summary(self) -> dict[str, Any]:
        subtotal = sum(
            (Decimal(str(item.get("line_total") or "0")) for item in self.session.cart),
            Decimal("0.00"),
        )
        return {
            "revision": self.session.cart_revision,
            "items": self.session.cart,
            "estimated_subtotal": _money(subtotal),
            "requires_quote": not self.session.quote_is_current,
        }

    def _persist(self) -> None:
        self.call_log.session_state = self.session.state
        self.call_log.transfer_requested = self.session.transfer_requested
        self.call_log.draft_cart = self.session.to_draft_payload()


def record_voice_tool_call(
    call_log: Any,
    tool_name: str,
    arguments: dict[str, Any] | None,
    response: dict[str, Any],
) -> None:
    if not call_log:
        return
    sensitive_fields = {"confirmation_token", "customer_name", "delivery_address", "phone_number"}

    def redact(value):
        if isinstance(value, dict):
            return {
                key: "[redacted]" if key in sensitive_fields else redact(item)
                for key, item in value.items()
            }
        if isinstance(value, list):
            return [redact(item) for item in value]
        return value

    safe_arguments = redact(arguments or {})
    safe_response = redact(response)
    call_log.tool_calls.append(
        CallLogToolCall(
            tool_name=tool_name,
            payload={"arguments": safe_arguments, "response": safe_response},
        )
    )
