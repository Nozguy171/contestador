from sqlalchemy import Enum

from app.extensions import db
from app.models.base import JSON_VARIANT, SerializerMixin, TimestampMixin
from app.models.enums import CallStatus


class CallLog(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "call_logs"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    phone_number = db.Column(db.String(32), nullable=False)
    to_number = db.Column(db.String(32), nullable=True)
    provider_call_sid = db.Column(db.String(64), nullable=True, index=True)
    provider_stream_sid = db.Column(db.String(64), nullable=True, index=True)
    start_time = db.Column(db.DateTime(timezone=True), nullable=False)
    end_time = db.Column(db.DateTime(timezone=True), nullable=True)
    duration_seconds = db.Column(db.Integer, nullable=True)
    status = db.Column(Enum(CallStatus, native_enum=False), nullable=False)
    resulted_in_order = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    transcript = db.Column(db.Text, nullable=True)
    ai_summary = db.Column(db.Text, nullable=True)
    confidence = db.Column(db.Numeric(5, 2), nullable=True)
    session_state = db.Column(db.String(32), nullable=False, default="ended", server_default="ended")
    draft_cart = db.Column(JSON_VARIANT, nullable=False, default=dict)
    transfer_requested = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())

    business = db.relationship("Business", back_populates="call_logs")
    customer = db.relationship("Customer", back_populates="call_logs")
    error_flags = db.relationship("CallLogErrorFlag", back_populates="call_log", cascade="all, delete-orphan")
    tool_calls = db.relationship("CallLogToolCall", back_populates="call_log", cascade="all, delete-orphan")
    order = db.relationship(
        "Order",
        back_populates="source_call_log",
        primaryjoin="CallLog.id == foreign(Order.call_log_id)",
        uselist=False,
        viewonly=True,
    )


class CallLogErrorFlag(db.Model, SerializerMixin):
    __tablename__ = "call_log_error_flags"

    id = db.Column(db.Integer, primary_key=True)
    call_log_id = db.Column(db.Integer, db.ForeignKey("call_logs.id", ondelete="CASCADE"), nullable=False, index=True)
    flag = db.Column(db.String(120), nullable=False)

    call_log = db.relationship("CallLog", back_populates="error_flags")


class CallLogToolCall(db.Model, SerializerMixin):
    __tablename__ = "call_log_tool_calls"

    id = db.Column(db.Integer, primary_key=True)
    call_log_id = db.Column(db.Integer, db.ForeignKey("call_logs.id", ondelete="CASCADE"), nullable=False, index=True)
    tool_name = db.Column(db.String(120), nullable=False)
    payload = db.Column(JSON_VARIANT, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=db.func.now(), nullable=False)

    call_log = db.relationship("CallLog", back_populates="tool_calls")
