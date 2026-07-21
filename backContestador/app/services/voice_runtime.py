from __future__ import annotations

from dataclasses import dataclass
from typing import Any


DAY_LABELS = {
    0: "lunes",
    1: "martes",
    2: "miércoles",
    3: "jueves",
    4: "viernes",
    5: "sábado",
    6: "domingo",
}


def _time_to_string(value: Any) -> str | None:
    if value is None:
        return None
    return value.strftime("%H:%M")


@dataclass(frozen=True)
class VoiceRuntimeConfig:
    public_base_url: str
    twilio_account_sid: str
    twilio_auth_token: str
    twilio_validate_signature: bool
    twilio_status_callback_url: str
    gemini_api_key: str
    gemini_model: str
    gemini_http_api_version: str
    gemini_voice_name: str
    gemini_language_code: str
    voice_webhook_path: str
    voice_stream_path: str
    voice_status_path: str
    voice_stream_token_ttl_seconds: int
    voice_start_of_speech_sensitivity: str
    voice_end_of_speech_sensitivity: str
    voice_prefix_padding_ms: int
    voice_silence_duration_ms: int

    @classmethod
    def from_app_config(cls, config: Any) -> "VoiceRuntimeConfig":
        return cls(
            public_base_url=config.get("PUBLIC_BASE_URL", "").rstrip("/"),
            twilio_account_sid=config.get("TWILIO_ACCOUNT_SID", ""),
            twilio_auth_token=config.get("TWILIO_AUTH_TOKEN", ""),
            twilio_validate_signature=bool(config.get("TWILIO_VALIDATE_SIGNATURE", False)),
            twilio_status_callback_url=config.get("TWILIO_STATUS_CALLBACK_URL", ""),
            gemini_api_key=config.get("GEMINI_API_KEY", ""),
            gemini_model=config.get("GEMINI_MODEL", "gemini-3.1-flash-live-preview"),
            gemini_http_api_version=config.get("GEMINI_HTTP_API_VERSION", "v1beta"),
            gemini_voice_name=config.get("GEMINI_VOICE_NAME", "Aoede"),
            gemini_language_code=config.get("GEMINI_LANGUAGE_CODE", "es-MX"),
            voice_webhook_path=config.get("VOICE_WEBHOOK_PATH", "/voice/incoming"),
            voice_stream_path=config.get("VOICE_STREAM_PATH", "/api/v1/voice/twilio/media-stream"),
            voice_status_path=config.get("VOICE_STATUS_PATH", "/api/v1/voice/twilio/status"),
            voice_stream_token_ttl_seconds=int(config.get("VOICE_STREAM_TOKEN_TTL_SECONDS", 300)),
            voice_start_of_speech_sensitivity=config.get("VOICE_START_OF_SPEECH_SENSITIVITY", "START_SENSITIVITY_LOW"),
            voice_end_of_speech_sensitivity=config.get("VOICE_END_OF_SPEECH_SENSITIVITY", "END_SENSITIVITY_LOW"),
            voice_prefix_padding_ms=int(config.get("VOICE_PREFIX_PADDING_MS", 120)),
            voice_silence_duration_ms=int(config.get("VOICE_SILENCE_DURATION_MS", 700)),
        )

    @property
    def twilio_inbound_url(self) -> str:
        return f"{self.public_base_url}{self.voice_webhook_path}"

    @property
    def twilio_status_url(self) -> str:
        return self.twilio_status_callback_url or f"{self.public_base_url}{self.voice_status_path}"

    @property
    def twilio_stream_url(self) -> str:
        if not self.public_base_url:
            return ""
        if self.public_base_url.startswith("https://"):
            scheme = "wss://"
            base = self.public_base_url.removeprefix("https://")
        elif self.public_base_url.startswith("http://"):
            scheme = "ws://"
            base = self.public_base_url.removeprefix("http://")
        else:
            scheme = "wss://"
            base = self.public_base_url
        return f"{scheme}{base}{self.voice_stream_path}"

    @staticmethod
    def _configured(value: str) -> bool:
        normalized = (value or "").upper()
        return bool(value and "REEMPLAZA" not in normalized and "CHANGE-ME" not in normalized)

    @property
    def twilio_ready(self) -> bool:
        return self.public_base_url.startswith("https://") and all(
            self._configured(value)
            for value in [self.twilio_account_sid, self.twilio_auth_token]
        )

    @property
    def gemini_ready(self) -> bool:
        return self._configured(self.gemini_api_key) and self._configured(self.gemini_model)

    @property
    def ready(self) -> bool:
        return self.twilio_ready and self.gemini_ready

    def to_status_payload(self) -> dict[str, Any]:
        return {
            "ready": self.ready,
            "twilio": {
                "ready": self.twilio_ready,
                "inbound_url": self.twilio_inbound_url if self.public_base_url else None,
                "stream_url": self.twilio_stream_url if self.public_base_url else None,
                "status_callback_url": self.twilio_status_url if self.public_base_url else None,
                "validate_signature": self.twilio_validate_signature,
                "transport": "bidirectional_media_streams",
            },
            "gemini": {
                "ready": self.gemini_ready,
                "model": self.gemini_model,
                "http_api_version": self.gemini_http_api_version,
                "voice_name": self.gemini_voice_name,
                "language_code": self.gemini_language_code,
                "response_modality": "AUDIO",
            },
            "vad": {
                "start_of_speech_sensitivity": self.voice_start_of_speech_sensitivity,
                "end_of_speech_sensitivity": self.voice_end_of_speech_sensitivity,
                "prefix_padding_ms": self.voice_prefix_padding_ms,
                "silence_duration_ms": self.voice_silence_duration_ms,
            },
            "audio": {
                "twilio_input": "audio/x-mulaw;rate=8000",
                "gemini_input": "audio/pcm;rate=16000",
                "gemini_output": "audio/pcm;rate=24000",
                "twilio_output": "audio/x-mulaw;rate=8000",
                "chunk_ms": 20,
            },
        }


def build_business_voice_context(business: Any) -> dict[str, Any]:
    settings = business.settings
    bot_config = business.bot_config

    hours = []
    for hour in sorted(business.hours, key=lambda item: item.day_of_week):
        hours.append(
            {
                "day": DAY_LABELS.get(hour.day_of_week, str(hour.day_of_week)),
                "is_closed": hour.is_closed,
                "open": _time_to_string(hour.open_time),
                "close": _time_to_string(hour.close_time),
            }
        )

    return {
        "business_name": business.name,
        "address": business.address,
        "phone": business.phone,
        "human_transfer_configured": bool(business.human_transfer_number),
        "email": business.email,
        "estimated_delivery_time": business.estimated_delivery_time,
        "hours": hours,
        "delivery_zones": [zone.name for zone in business.delivery_zones if zone.is_active],
        "promotions": [promotion.text for promotion in business.promotions if promotion.is_active],
        "policies": [policy.text for policy in business.policies if policy.is_active],
        "faqs": [
            {
                "category": faq.category,
                "question": faq.question,
                "answer": faq.answer,
            }
            for faq in business.faqs
            if faq.is_active
        ],
        "menu_rules": [
            {
                "name": rule.name,
                "type": rule.type.value,
                "description": rule.description,
                "config": rule.config,
            }
            for rule in business.menu_rules
            if rule.is_active
        ],
        "settings": {
            "delivery_enabled": settings.delivery_enabled if settings else True,
            "minimum_order_delivery": str(settings.minimum_order_delivery) if settings and settings.minimum_order_delivery is not None else None,
            "delivery_fee": str(settings.delivery_fee) if settings and settings.delivery_fee is not None else None,
            "free_delivery_threshold": str(settings.free_delivery_threshold) if settings and settings.free_delivery_threshold is not None else None,
            "estimated_prep_time_minutes": settings.estimated_prep_time_minutes if settings else None,
            "accept_cash": settings.accept_cash if settings else True,
            "accept_card": settings.accept_card if settings else True,
            "accept_online": settings.accept_online if settings else True,
            "cash_only_threshold": str(settings.cash_only_threshold) if settings and settings.cash_only_threshold is not None else None,
            "require_prepayment": settings.require_prepayment if settings else False,
        },
        "bot": {
            "welcome_message": bot_config.welcome_message if bot_config else None,
            "after_hours_message": bot_config.after_hours_message if bot_config else None,
            "fallback_message": bot_config.fallback_message if bot_config else None,
            "confirmation_required": bot_config.confirmation_required if bot_config else True,
            "retry_count": bot_config.retry_count if bot_config else 1,
            "can_suggest_alternatives": bot_config.can_suggest_alternatives if bot_config else True,
            "tone": bot_config.tone.value if bot_config else "friendly",
            "special_instructions": bot_config.special_instructions if bot_config else None,
        },
    }


def build_gemini_system_prompt(business: Any) -> str:
    context = build_business_voice_context(business)
    settings = context["settings"]
    bot = context["bot"]
    faq_lines = "\n".join(
        f"- {faq['question']}: {faq['answer']}" for faq in context["faqs"]
    ) or "- No hay FAQs configuradas todavía."
    promotion_lines = "\n".join(f"- {item}" for item in context["promotions"]) or "- Sin promociones activas."
    policy_lines = "\n".join(f"- {item}" for item in context["policies"]) or "- Sin políticas activas."
    zone_lines = "\n".join(f"- {item}" for item in context["delivery_zones"]) or "- Sin zonas de entrega configuradas."
    menu_rule_lines = "\n".join(
        f"- {rule['name']} ({rule['type']}): {rule['description'] or rule['config']}"
        for rule in context["menu_rules"]
    ) or "- Sin reglas especiales activas."
    def format_hour_line(hour: dict[str, Any]) -> str:
        if hour["is_closed"]:
            return f"- {hour['day']}: cerrado"
        return f"- {hour['day']}: {hour['open']} a {hour['close']}"

    hour_lines = "\n".join(
        format_hour_line(hour) for hour in context["hours"]
    )

    return f"""
Eres el asistente telefónico en español de {context['business_name']}.
Tu objetivo es atender llamadas, responder preguntas del negocio y ayudar a levantar pedidos con claridad.

Datos base del negocio:
- Nombre: {context['business_name']}
- Dirección: {context['address'] or 'No configurada'}
- Teléfono: {context['phone'] or 'No configurado'}
- Correo: {context['email'] or 'No configurado'}
- Tiempo estimado de entrega: {context['estimated_delivery_time'] or 'No configurado'}

Horario:
{hour_lines}

Entrega:
- Habilitada: {'sí' if settings['delivery_enabled'] else 'no'}
- Pedido mínimo: {settings['minimum_order_delivery'] or 'No configurado'}
- Costo de envío: {settings['delivery_fee'] or 'No configurado'}
- Envío gratis a partir de: {settings['free_delivery_threshold'] or 'No configurado'}
- Tiempo estimado de preparación: {settings['estimated_prep_time_minutes'] or 'No configurado'}
- Zonas activas:
{zone_lines}

Pagos:
- Efectivo: {'sí' if settings['accept_cash'] else 'no'}
- Tarjeta: {'sí' if settings['accept_card'] else 'no'}
- Pago en línea: {'sí' if settings['accept_online'] else 'no'}
- Solo efectivo arriba de: {settings['cash_only_threshold'] or 'No aplica'}
- Requiere prepago: {'sí' if settings['require_prepayment'] else 'no'}

Promociones activas:
{promotion_lines}

Políticas:
{policy_lines}

Reglas activas del menú:
{menu_rule_lines}

FAQ:
{faq_lines}

Comportamiento del bot:
- Tono: {bot['tone']}
- Confirmación obligatoria: {'sí' if bot['confirmation_required'] else 'no'}
- Reintentos: {bot['retry_count']}
- Puede sugerir alternativas: {'sí' if bot['can_suggest_alternatives'] else 'no'}
- Mensaje de bienvenida: {bot['welcome_message'] or 'No configurado'}
- Mensaje fuera de horario: {bot['after_hours_message'] or 'No configurado'}
- Mensaje de respaldo: {bot['fallback_message'] or 'No configurado'}
- Instrucciones especiales: {bot['special_instructions'] or 'Sin instrucciones extra'}

Reglas:
- Responde siempre en español.
- Sé breve, claro y útil.
- No inventes productos, horarios, precios ni promociones.
- Nunca aceptes ni propongas un tenantId o businessId: la sesión ya está ligada al negocio correcto.
- No calcules precios ni asumas disponibilidad. Usa siempre las herramientas del backend.
- Para conocer el menú usa search_menu; para opciones usa get_item_options.
- Mantén el pedido únicamente mediante add_to_cart y remove_item.
- Si falta información, dilo claramente y ofrece transfer_to_human.
- Si el negocio está cerrado, usa el mensaje fuera de horario como base.
- Antes de confirmar un pedido llama quote_order, repite productos, cantidades, total, tipo de entrega y pago, y pide un sí explícito.
- Llama submit_order únicamente después de ese sí explícito, usando el token de la cotización vigente y confirmed=true.
- Solo di que el pedido quedó registrado después de que submit_order responda con ok=true.
- Si el cliente cambia el carrito después de cotizar, vuelve a llamar quote_order y vuelve a pedir confirmación.
""".strip()
