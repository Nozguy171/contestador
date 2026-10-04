from __future__ import annotations

import secrets
import unicodedata
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Any
from uuid import uuid4

from sqlalchemy import or_

from app.models import CallLogToolCall, Category, GeoSettlement, GeoStreet, Product
from app.services.address_catalog import delivery_coverage_status, resolve_geo_address
from app.services.orders import (
    OrderValidationError,
    quote_voice_order,
    submit_voice_order,
)
from app.utils.phone import normalize_phone_number


VOICE_FUNCTION_DECLARATIONS: list[dict[str, Any]] = [
    {
        "name": "list_menu_categories",
        "description": "Lista las categorías activas del menú y cuántos productos tiene cada una.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "search_menu",
        "description": "Busca productos activos del menú del negocio actual. Devuelve páginas de hasta 12 productos.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Producto, ingrediente o categoría a buscar."},
                "category_id": {"type": "integer", "description": "Filtra una categoría obtenida con list_menu_categories."},
                "page": {"type": "integer", "minimum": 1, "maximum": 50},
            },
            "required": ["query"],
        },
    },
    {
        "name": "resolve_menu_item",
        "description": "Busca nombres y alias del menú y devuelve una coincidencia clara o candidatos ambiguos. Nunca agrega al carrito.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Nombre que dijo el cliente."}},
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
        "name": "mark_unavailable_item",
        "description": "Registra un producto pedido que no está en el menú o aparece agotado para pedir permiso antes de continuar sin él.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "resolve_unavailable_item",
        "description": "Marca como resuelto un producto que no está en el menú después de que el cliente acepta continuar sin él.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Producto no disponible que el cliente decidió omitir."}
            },
            "required": ["query"],
        },
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
        "name": "update_cart_line",
        "description": "Reemplaza la cantidad y, opcionalmente, las personalizaciones de una línea existente. No suma unidades.",
        "parameters": {
            "type": "object",
            "properties": {
                "line_id": {"type": "string", "description": "line_id devuelto por get_cart."},
                "qty": {"type": "integer", "minimum": 1, "maximum": 99, "description": "Cantidad final deseada."},
                "modifiers": {"type": "array", "items": {"type": "integer"}, "description": "IDs finales de modificadores; si no se envía, conserva los actuales."},
            },
            "required": ["line_id", "qty"],
        },
    },
    {
        "name": "resolve_delivery_address",
        "description": "Busca calle, asentamiento y localidad en el catálogo geográfico configurado. Devuelve candidatos y cobertura, no confirma ni cambia nada por sí sola.",
        "parameters": {
            "type": "object",
            "properties": {
                "street": {"type": "string"},
                "number": {"type": "string"},
                "interior_number": {"type": "string"},
                "colony": {"type": "string"},
                "city": {"type": "string"},
                "postal_code": {"type": "string"},
                "references": {"type": "string"},
            },
            "required": ["street", "number", "colony"],
        },
    },
    {
        "name": "confirm_delivery_address",
        "description": "Guarda la selección de calle y asentamiento sólo después de que el cliente confirme en voz alta el domicilio leído completo.",
        "parameters": {
            "type": "object",
            "properties": {
                "street_id": {"type": "integer"},
                "settlement_id": {"type": "integer"},
                "confirmed": {"type": "boolean"},
            },
            "required": ["street_id", "settlement_id", "confirmed"],
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
                "cash_change_for": {
                    "type": "string",
                    "description": "Sólo para entrega a domicilio pagada en efectivo: monto con el que pagará si necesita cambio. No lo uses para recoger en tienda.",
                },
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
        "aliases": list(product.aliases or []),
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
                "is_required": item.is_required,
            }
            for item in sorted(product.modifiers, key=lambda row: (row.sort_order, row.id))
            if item.is_active
        ],
    }


class MenuResolver:
    @staticmethod
    def normalize(value: Any) -> str:
        text = unicodedata.normalize("NFKD", str(value or "").casefold())
        text = "".join(char for char in text if not unicodedata.combining(char))
        return " ".join("".join(char if char.isalnum() else " " for char in text).split())

    @classmethod
    def resolve(cls, query: str, products: list[Product]) -> dict[str, Any]:
        normalized_query = cls.normalize(query)
        if not normalized_query:
            return {"status": "not_found", "candidates": []}

        by_product: dict[int, tuple[Product, float, str]] = {}
        for product in products:
            names = [(product.name, "canonical")]
            names.extend((str(alias), "alias") for alias in (product.aliases or []))
            best = (product, 0.0, "fuzzy")
            for name, kind in names:
                normalized_name = cls.normalize(name)
                if not normalized_name:
                    continue
                score = (
                    1.0 if normalized_query == normalized_name
                    else SequenceMatcher(None, normalized_query, normalized_name).ratio()
                )
                if score > best[1]:
                    best = (product, score, "exact" if score == 1.0 else kind)
            if best[1] >= 0.78:
                by_product[product.id] = best

        ranked = sorted(by_product.values(), key=lambda row: (-row[1], row[0].name.casefold(), row[0].id))
        candidates = [
            {
                "id": item.id,
                "name": item.name,
                "category": item.category.name if item.category else None,
                "score": round(score, 3),
                "match": kind,
                "available": not bool(getattr(item, "is_sold_out", False)),
            }
            for item, score, kind in ranked[:5]
        ]
        if not candidates:
            status = "not_found"
        elif len(candidates) == 1 and candidates[0]["match"] == "exact":
            status = "exact_match"
        elif (
            candidates[0]["score"] >= 0.91
            and (len(candidates) == 1 or candidates[0]["score"] - candidates[1]["score"] >= 0.12)
        ):
            status = "single_candidate"
        else:
            status = "ambiguous"
        return {"status": status, "candidates": candidates}


def _format_delivery_address(captured: dict[str, Any], selected: dict[str, Any] | None = None) -> str:
    street_name = selected.get("street_name") if selected else captured.get("street")
    street_type = selected.get("street_type") if selected else None
    street = " ".join(part for part in (street_type, street_name) if part)
    number = str(captured.get("number") or "").strip()
    interior = str(captured.get("interior_number") or "").strip()
    colony_name = selected.get("settlement_name") if selected else captured.get("colony")
    colony_type = selected.get("settlement_type") if selected else None
    colony = " ".join(part for part in (colony_type, colony_name) if part)
    locality = (
        selected.get("locality_name") if selected else None
    ) or str(captured.get("city") or "").strip()
    pieces = [f"{street} {number}".strip()]
    if interior:
        pieces[0] += f", interior {interior}"
    pieces.extend([f"colonia {colony}".strip(), locality])
    address = ", ".join(part for part in pieces if part)
    references = str(captured.get("references") or "").strip()
    if references:
        address += f". Referencias: {references}"
    return address


def _structured_address(
    business,
    captured: dict[str, Any],
    selected: dict[str, Any] | None,
    *,
    status: str,
) -> dict[str, Any]:
    return {
        "delivery_street_type": selected.get("street_type") if selected else None,
        "delivery_street_name": selected.get("street_name") if selected else captured.get("street"),
        "delivery_exterior_number": captured.get("number"),
        "delivery_interior_number": captured.get("interior_number") or None,
        "delivery_settlement_type": selected.get("settlement_type") if selected else None,
        "delivery_settlement_name": selected.get("settlement_name") if selected else captured.get("colony"),
        "delivery_postal_code": captured.get("postal_code") or None,
        "delivery_locality": (
            selected.get("locality_name") if selected else None
        ) or captured.get("city") or business.locality_name,
        "delivery_municipality": business.municipality_name,
        "delivery_state": business.state_name,
        "delivery_country": "México" if business.country_code == "MX" else business.country_code,
        "delivery_references": captured.get("references") or None,
        "address_resolution_status": status,
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
            "list_menu_categories": self._list_menu_categories,
            "search_menu": self._search_menu,
            "resolve_menu_item": self._resolve_menu_item,
            "get_item_options": self._get_item_options,
            "get_cart": self._get_cart,
            "resolve_unavailable_item": self._resolve_unavailable_item,
            "mark_unavailable_item": self._mark_unavailable_item,
            "add_to_cart": self._add_to_cart,
            "update_cart_line": self._update_cart_line,
            "remove_item": self._remove_item,
            "resolve_delivery_address": self._resolve_delivery_address,
            "confirm_delivery_address": self._confirm_delivery_address,
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

    def _list_menu_categories(self, args: dict[str, Any]) -> dict[str, Any]:
        del args
        rows = (
            Category.query.filter_by(business_id=self.session.tenant_id, is_active=True)
            .order_by(Category.sort_order, Category.name)
            .all()
        )
        return {
            "ok": True,
            "categories": [
                {
                    "id": row.id,
                    "name": row.name,
                    "description": row.description,
                    "product_count": Product.query.filter_by(
                        business_id=self.session.tenant_id,
                        category_id=row.id,
                        is_active=True,
                    ).count(),
                }
                for row in rows
            ],
        }

    def _search_menu(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query") or "").strip()[:120]
        normalized_query = MenuResolver.normalize(query).strip()
        if normalized_query in {
            "menu",
            "productos",
            "que tienen",
            "que hay",
            "todo",
        }:
            query = ""
        products = Product.query.filter_by(
            business_id=self.session.tenant_id,
            is_active=True,
        ).outerjoin(Category, Product.category_id == Category.id)
        if query:
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            products = products.filter(
                or_(
                    Product.name.ilike(f"%{escaped}%", escape="\\"),
                    Product.description.ilike(f"%{escaped}%", escape="\\"),
                    Category.name.ilike(f"%{escaped}%", escape="\\"),
                )
            )
        category_id = args.get("category_id")
        if category_id is not None:
            try:
                category_id = int(category_id)
            except (TypeError, ValueError) as exc:
                raise OrderValidationError("La categoría del menú no es válida.") from exc
            if not Category.query.filter_by(id=category_id, business_id=self.session.tenant_id, is_active=True).first():
                raise OrderValidationError("La categoría del menú no está disponible.")
            products = products.filter(Product.category_id == category_id)
        try:
            page = max(1, min(int(args.get("page", 1)), 50))
        except (TypeError, ValueError):
            page = 1
        page_size = 12
        total = products.count()
        rows = products.order_by(Product.name, Product.id).offset((page - 1) * page_size).limit(page_size).all()
        items = [_product_payload(item) for item in rows]
        return {
            "ok": True,
            "query": query,
            "items": items,
            "page": page,
            "page_size": page_size,
            "has_more": page * page_size < total,
            "next_page": page + 1 if page * page_size < total else None,
            "not_found": query if query and not items else None,
            "unavailable_items": self.session.unavailable_items,
        }

    def _resolve_menu_item(self, args: dict[str, Any]) -> dict[str, Any]:
        if not (self.business.settings and self.business.settings.voice_menu_v2_enabled):
            raise OrderValidationError("La resolución de alias del menú todavía no está habilitada.")
        query = str(args.get("query") or "").strip()[:120]
        if not query:
            raise OrderValidationError("Falta el nombre del producto.")
        products = Product.query.filter_by(
            business_id=self.session.tenant_id,
            is_active=True,
        ).all()
        matches = MenuResolver.resolve(query, products)
        return {"ok": True, "query": query, **matches}

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
        try:
            product_id = int(args.get("id"))
        except (TypeError, ValueError) as exc:
            raise OrderValidationError("El ID de producto es inválido.") from exc
        product = Product.query.filter_by(
            id=product_id,
            business_id=self.session.tenant_id,
            is_active=True,
        ).first()
        if not product:
            raise OrderValidationError("Ese producto no está disponible.")
        return {"ok": True, "item": _product_payload(product)}

    def _get_cart(self, args: dict[str, Any]) -> dict[str, Any]:
        del args
        return {"ok": True, "cart": self._cart_summary()}

    def _resolve_unavailable_item(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query") or "").strip()
        if not query:
            raise OrderValidationError("Falta indicar qué producto no disponible se omitirá.")
        normalized = MenuResolver.normalize(query)
        before = len(self.session.unavailable_items)
        self.session.unavailable_items = [
            item for item in self.session.unavailable_items if MenuResolver.normalize(item) != normalized
        ]
        if len(self.session.unavailable_items) == before:
            raise OrderValidationError("Ese producto no está registrado como pendiente.")
        self._persist()
        return {
            "ok": True,
            "resolved": query,
            "remaining_unavailable_items": self.session.unavailable_items,
            "cart": self._cart_summary(),
        }

    def _mark_unavailable_item(self, args: dict[str, Any]) -> dict[str, Any]:
        query = str(args.get("query") or "").strip()[:120]
        if not query:
            raise OrderValidationError("Falta el producto que el cliente pidió.")
        products = Product.query.filter_by(
            business_id=self.session.tenant_id,
            is_active=True,
        ).all()
        resolution = MenuResolver.resolve(query, products)
        if resolution["status"] == "exact_match":
            match_id = resolution["candidates"][0]["id"]
            match = next((item for item in products if item.id == match_id), None)
            if not match or not match.is_sold_out:
                raise OrderValidationError("El producto tiene una coincidencia disponible en el menú; aclara cuál quiso decir.")
        elif resolution["status"] != "not_found":
            raise OrderValidationError("El producto tiene candidatos en el menú; aclara cuál quiso decir.")
        if all(MenuResolver.normalize(item) != MenuResolver.normalize(query) for item in self.session.unavailable_items):
            self.session.unavailable_items.append(query)
            self._persist()
        return {"ok": True, "pending_customer_decision": query}

    def _validated_modifiers(self, product: Product, raw_modifier_ids: Any) -> tuple[list[int], list[dict[str, Any]], Decimal]:
        try:
            modifier_ids = [int(value) for value in (raw_modifier_ids or [])]
        except (TypeError, ValueError) as exc:
            raise OrderValidationError("Los modificadores son inválidos.") from exc
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
        required_groups = set()
        for item in product.modifiers:
            if item.is_active and item.action == "choice" and item.is_required:
                required_groups.add(item.group_name)
        for item in modifier_map.values():
            if item.action != "choice":
                continue
            if item.group_name in choice_groups:
                raise OrderValidationError(
                    f"Sólo puedes elegir una opción de {item.group_name} para {product.name}."
                )
            choice_groups.add(item.group_name)
        missing_groups = sorted(required_groups - choice_groups)
        if missing_groups:
            raise OrderValidationError(
                f"Elige una opción de {', '.join(missing_groups)} para {product.name}."
            )
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
        canonical_ids = [item["id"] for item in modifiers]
        modifier_total = sum((Decimal(item["price"]) for item in modifiers), Decimal("0.00"))
        return canonical_ids, modifiers, modifier_total

    def _add_to_cart(self, args: dict[str, Any]) -> dict[str, Any]:
        product = self._product(args.get("id"))
        try:
            quantity = int(args.get("qty"))
        except (TypeError, ValueError) as exc:
            raise OrderValidationError("La cantidad o los modificadores son inválidos.") from exc
        if quantity < 1 or quantity > 99:
            raise OrderValidationError("La cantidad debe estar entre 1 y 99.")
        modifier_ids, modifiers, modifier_total = self._validated_modifiers(product, args.get("modifiers"))

        matching = next(
            (
                item
                for item in self.session.cart
                if item.get("product_id") == product.id
                and set(item.get("modifier_ids", [])) == set(modifier_ids)
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

    def _update_cart_line(self, args: dict[str, Any]) -> dict[str, Any]:
        line_id = str(args.get("line_id") or "").strip()
        line = next((item for item in self.session.cart if str(item.get("line_id")) == line_id), None)
        if not line:
            raise OrderValidationError("Esa línea ya no existe en el carrito.")
        product = self._product(line.get("product_id"))
        try:
            quantity = int(args.get("qty"))
        except (TypeError, ValueError) as exc:
            raise OrderValidationError("La cantidad final es inválida.") from exc
        if quantity < 1 or quantity > 99:
            raise OrderValidationError("La cantidad debe estar entre 1 y 99.")
        modifier_ids, modifiers, modifier_total = self._validated_modifiers(
            product,
            args.get("modifiers", line.get("modifier_ids", [])),
        )
        line.update({
            "name": product.name,
            "quantity": quantity,
            "unit_price": _money(product.price),
            "modifier_ids": modifier_ids,
            "modifiers": modifiers,
            "line_total": _money((product.price + modifier_total) * quantity),
        })
        self.session.cart_changed()
        self._persist()
        return {"ok": True, "updated": line, "cart": self._cart_summary()}

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

    def _address_mode(self) -> str:
        return getattr(self.business.settings, "voice_address_mode", "off") if self.business.settings else "off"

    @staticmethod
    def _address_text(args: dict[str, Any], key: str, max_length: int = 200) -> str:
        value = str(args.get(key) or "").strip()
        if len(value) > max_length:
            raise OrderValidationError(f"El campo de domicilio {key} es demasiado largo.")
        return value

    def _resolve_delivery_address(self, args: dict[str, Any]) -> dict[str, Any]:
        mode = self._address_mode()
        if mode == "off":
            raise OrderValidationError("La resolución de domicilios está desactivada para este negocio.")
        captured = {
            "street": self._address_text(args, "street"),
            "number": self._address_text(args, "number", 40),
            "interior_number": self._address_text(args, "interior_number", 40),
            "colony": self._address_text(args, "colony"),
            "city": self._address_text(args, "city", 160),
            "postal_code": self._address_text(args, "postal_code", 10),
            "references": self._address_text(args, "references", 500),
        }
        if not captured["street"] or not captured["number"] or not captured["colony"]:
            raise OrderValidationError("Se requiere la calle, número exterior y colonia para resolver el domicilio.")
        result = resolve_geo_address(
            business=self.business,
            street=captured["street"],
            colony=captured["colony"],
            city=captured["city"] or None,
        )
        address_state = {
            "captured": captured,
            "mode": mode,
            "status": result["status"],
            "coverage": result.get("coverage", "unknown"),
            "candidates": result.get("candidates", []),
            "localities": result.get("localities", []),
            "catalog_version_id": result.get("catalog_version_id"),
            "catalog_edition": result.get("catalog_edition"),
            "confirmed": False,
            "selected": None,
        }
        if self.session.checkout.get("delivery_address_resolution") != address_state:
            self.session.checkout["delivery_address_resolution"] = address_state
            self.session.cart_changed()
            self._persist()
        return {
            "ok": True,
            "status": result["status"],
            "coverage": result.get("coverage", "unknown"),
            "candidates": result.get("candidates", []),
            "localities": result.get("localities", []),
            "catalog_edition": result.get("catalog_edition"),
            "confirmation_required": mode in {"candidate", "enforce"},
            "numbers_preserved_verbatim": True,
        }

    def _confirm_delivery_address(self, args: dict[str, Any]) -> dict[str, Any]:
        if self._address_mode() not in {"candidate", "enforce"}:
            raise OrderValidationError("Este negocio no requiere confirmar candidatos de domicilio.")
        if args.get("confirmed") is not True:
            raise OrderValidationError("El cliente debe confirmar el domicilio completo en voz alta.")
        state = self.session.checkout.get("delivery_address_resolution") or {}
        if state.get("status") not in {"exact_match", "ambiguous"}:
            raise OrderValidationError("Primero resuelve el domicilio con el catálogo vigente.")
        try:
            street_id = int(args.get("street_id"))
            settlement_id = int(args.get("settlement_id"))
        except (TypeError, ValueError) as exc:
            raise OrderValidationError("El candidato de domicilio es inválido.") from exc
        selected = next(
            (
                candidate
                for candidate in state.get("candidates", [])
                if candidate.get("street_id") == street_id
                and candidate.get("settlement_id") == settlement_id
            ),
            None,
        )
        if not selected:
            raise OrderValidationError("La calle y colonia elegidas no pertenecen a los candidatos mostrados.")
        if state.get("catalog_version_id") != self.business.geo_catalog_version_id:
            raise OrderValidationError("El catálogo cambió; vuelve a resolver el domicilio.")
        street = GeoStreet.query.filter_by(
            id=street_id,
            catalog_version_id=self.business.geo_catalog_version_id,
        ).first()
        settlement = GeoSettlement.query.filter_by(
            id=settlement_id,
            catalog_version_id=self.business.geo_catalog_version_id,
        ).first()
        if (
            not street or not settlement
            or street.locality_code != settlement.locality_code
            or street.locality_code != selected.get("locality_code")
            or settlement.source_key != selected.get("settlement_key")
        ):
            raise OrderValidationError("El catálogo cambió; vuelve a resolver el domicilio.")
        captured = state.get("captured") or {}
        if not captured.get("number"):
            raise OrderValidationError("Falta el número exterior leído al cliente.")
        state["confirmed"] = True
        state["selected"] = selected
        state["coverage"] = selected.get("coverage", "unknown")
        self.session.checkout["delivery_address_resolution"] = state
        self.session.cart_changed()
        self._persist()
        return {
            "ok": True,
            "confirmed": True,
            "coverage": state["coverage"],
            "delivery_address": _format_delivery_address(captured, selected),
            "numbers_preserved_verbatim": True,
        }

    def _require_current_confirmed_address(self) -> dict[str, Any]:
        state = self.session.checkout.get("delivery_address_resolution") or {}
        selected = state.get("selected") or {}
        if (
            not state.get("confirmed")
            or not selected
            or state.get("catalog_version_id") != self.business.geo_catalog_version_id
        ):
            raise OrderValidationError("La dirección todavía no está confirmada con el catálogo vigente.")
        street = GeoStreet.query.filter_by(
            id=selected.get("street_id"),
            catalog_version_id=self.business.geo_catalog_version_id,
        ).first()
        settlement = GeoSettlement.query.filter_by(
            id=selected.get("settlement_id"),
            catalog_version_id=self.business.geo_catalog_version_id,
        ).first()
        if (
            not street or not settlement
            or street.locality_code != settlement.locality_code
            or street.locality_code != selected.get("locality_code")
            or settlement.source_key != selected.get("settlement_key")
        ):
            raise OrderValidationError("El catálogo cambió; vuelve a resolver el domicilio.")
        state["coverage"] = delivery_coverage_status(
            business=self.business,
            settlement_key=settlement.source_key,
            locality_code=settlement.locality_code,
            catalog_version_id=self.business.geo_catalog_version_id,
        )
        selected["coverage"] = state["coverage"]
        state["selected"] = selected
        self.session.checkout["delivery_address_resolution"] = state
        return state

    def _quote_order(self, args: dict[str, Any]) -> dict[str, Any]:
        if self.session.unavailable_items:
            return {
                "ok": False,
                "error": "Hay productos solicitados que no están disponibles y todavía no se confirmó si se omiten.",
                "unavailable_items": self.session.unavailable_items,
                "instruction": "Dile al cliente cuáles no están disponibles. Si acepta continuar sin ellos, llama resolve_unavailable_item por cada uno y vuelve a cotizar.",
                "cart": self._cart_summary(),
            }
        if not self.session.cart:
            return {
                "ok": False,
                "error": "No hay productos agregados todavía; no se perdió ningún pedido. Agrega el producto y la cantidad antes de cotizar.",
                "cart": self._cart_summary(),
            }

        order_type = str(args.get("order_type") or "").strip()
        address_parts = args.get("delivery_address_parts")
        address_state = self.session.checkout.get("delivery_address_resolution") or {}
        address_components = None
        if order_type == "delivery":
            if (
                self._address_mode() in {"candidate", "enforce"}
                or address_state.get("mode") in {"candidate", "enforce"}
            ):
                address_state = self._require_current_confirmed_address()
                if not address_state.get("confirmed") or not address_state.get("selected"):
                    raise OrderValidationError("La dirección todavía no está confirmada por el cliente.")
                if isinstance(address_parts, dict):
                    captured = address_state.get("captured") or {}
                    for key in (
                        "street", "number", "interior_number", "colony", "city",
                        "postal_code", "references",
                    ):
                        if self._address_text(address_parts, key) != str(captured.get(key) or ""):
                            raise OrderValidationError("Cambió la dirección; vuelve a resolverla y confirmarla.")
                if (
                    self._address_mode() == "enforce" or address_state.get("mode") == "enforce"
                ) and address_state.get("coverage") != "in_coverage":
                    raise OrderValidationError("La cobertura de entrega no está confirmada para esa colonia.")
                captured = address_state["captured"]
                selected = address_state["selected"]
                delivery_address = _format_delivery_address(captured, selected)
                address_components = _structured_address(
                    self.business,
                    captured,
                    selected,
                    status="confirmed",
                )
            elif isinstance(address_parts, dict):
                labels = {
                    "street": "la calle",
                    "number": "el número",
                    "colony": "la colonia",
                    "city": "la ciudad",
                }
                captured = {
                    "street": self._address_text(address_parts, "street"),
                    "number": self._address_text(address_parts, "number", 40),
                    "interior_number": self._address_text(address_parts, "interior_number", 40),
                    "colony": self._address_text(address_parts, "colony"),
                    "city": self._address_text(address_parts, "city", 160),
                    "postal_code": self._address_text(address_parts, "postal_code", 10),
                    "references": self._address_text(address_parts, "references", 500),
                }
                missing = [label for key, label in labels.items() if not captured[key]]
                if missing:
                    raise OrderValidationError(f"Falta confirmar {', '.join(missing)}.")
                delivery_address = _format_delivery_address(captured)
                address_components = _structured_address(
                    self.business,
                    captured,
                    None,
                    status=(
                        f"shadow_{address_state.get('status', 'not_checked')}"
                        if self._address_mode() == "shadow"
                        else "legacy_unverified"
                    ),
                )
            else:
                delivery_address = str(args.get("delivery_address") or "").strip() or None
                address_components = None
        else:
            delivery_address = None

        checkout = {
            "customer_name": str(args.get("customer_name") or "").strip(),
            "order_type": order_type,
            "payment_method": str(args.get("payment_method") or "").strip(),
            "delivery_address": delivery_address,
            "cash_change_for": str(args.get("cash_change_for") or "").strip() or None,
            "notes": str(args.get("notes") or "").strip() or None,
            "delivery_address_components": address_components,
            "delivery_address_resolution": address_state,
        }
        if checkout != self.session.checkout:
            self.session.cart_changed()
        self.session.checkout = checkout
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

        address_state = self.session.checkout.get("delivery_address_resolution") or {}
        if (
            self.session.checkout.get("order_type") == "delivery"
            and (
                self._address_mode() in {"candidate", "enforce"}
                or address_state.get("mode") in {"candidate", "enforce"}
            )
        ):
            current_address = self._require_current_confirmed_address()
            if (
                self._address_mode() == "enforce" or current_address.get("mode") == "enforce"
            ) and current_address.get("coverage") != "in_coverage":
                raise OrderValidationError("La cobertura de entrega cambió; vuelve a cotizar o elige recoger en tienda.")

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
            "unavailable_items": self.session.unavailable_items,
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
    sensitive_fields = {
        "confirmation_token", "customer_name", "delivery_address", "delivery_address_parts",
        "phone_number", "street", "number", "interior_number", "colony", "city",
        "postal_code", "references", "street_name", "settlement_name", "locality_name",
        "canonical_address", "delivery_address_components", "delivery_street_type",
        "delivery_street_name", "delivery_exterior_number", "delivery_interior_number",
        "delivery_settlement_type", "delivery_settlement_name", "delivery_postal_code",
        "delivery_locality", "delivery_municipality", "delivery_state", "delivery_country",
        "delivery_references",
    }

    def redact(value):
        if isinstance(value, dict):
            return {
                key: "[redacted]" if str(key).casefold() in sensitive_fields else redact(item)
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
