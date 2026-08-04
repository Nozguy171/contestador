from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class CallSession:
    call_sid: str
    stream_sid: str
    tenant_id: int
    call_log_id: int
    caller_phone: str
    to_number: str
    state: str = "active"
    cart: list[dict[str, Any]] = field(default_factory=list)
    checkout: dict[str, Any] = field(default_factory=dict)
    cart_revision: int = 0
    quoted_revision: int | None = None
    quoted_order: dict[str, Any] | None = None
    confirmation_token: str | None = None
    pending_marks: set[str] = field(default_factory=set)
    response_playing: bool = False
    transfer_requested: bool = False
    hangup_after_response: bool = False

    @classmethod
    def from_call_log(cls, *, call_log: Any, stream_sid: str, call_sid: str) -> "CallSession":
        saved = call_log.draft_cart if isinstance(call_log.draft_cart, dict) else {}
        return cls(
            call_sid=call_sid,
            stream_sid=stream_sid,
            tenant_id=call_log.business_id,
            call_log_id=call_log.id,
            caller_phone=call_log.phone_number,
            to_number=call_log.to_number or "",
            state="active",
            cart=list(saved.get("items") or []),
            checkout=dict(saved.get("checkout") or {}),
            cart_revision=int(saved.get("revision") or 0),
            transfer_requested=bool(call_log.transfer_requested),
        )

    def cart_changed(self) -> None:
        self.cart_revision += 1
        self.quoted_revision = None
        self.quoted_order = None
        self.confirmation_token = None

    def set_quote(self, quote: dict[str, Any], confirmation_token: str) -> None:
        self.quoted_revision = self.cart_revision
        self.quoted_order = quote
        self.confirmation_token = confirmation_token

    @property
    def quote_is_current(self) -> bool:
        return (
            self.quoted_order is not None
            and self.confirmation_token is not None
            and self.quoted_revision == self.cart_revision
        )

    def to_draft_payload(self) -> dict[str, Any]:
        return {
            "version": 1,
            "revision": self.cart_revision,
            "items": self.cart,
            "checkout": self.checkout,
            "quote": self.quoted_order,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
