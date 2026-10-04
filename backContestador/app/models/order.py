from sqlalchemy import Enum

from app.extensions import db
from app.models.base import SerializerMixin, TimestampMixin
from app.models.enums import ChangedByType, OrderStatus, OrderType, PaymentMethod


class Order(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "orders"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    call_log_id = db.Column(db.Integer, db.ForeignKey("call_logs.id", ondelete="SET NULL"), nullable=True, index=True, unique=True)
    folio = db.Column(db.String(64), nullable=False, unique=True, index=True)
    customer_name = db.Column(db.String(160), nullable=False)
    phone_number = db.Column(db.String(32), nullable=False)
    type = db.Column(Enum(OrderType, native_enum=False), nullable=False)
    status = db.Column(Enum(OrderStatus, native_enum=False), nullable=False, default=OrderStatus.NEW)
    subtotal = db.Column(db.Numeric(10, 2), nullable=False, default=0, server_default="0")
    discount = db.Column(db.Numeric(10, 2), nullable=False, default=0, server_default="0")
    promotion_id = db.Column(
        db.Integer,
        db.ForeignKey("business_promotions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    promotion_name_snapshot = db.Column(db.String(160), nullable=True)
    delivery_fee = db.Column(db.Numeric(10, 2), nullable=False, default=0, server_default="0")
    total = db.Column(db.Numeric(10, 2), nullable=False, default=0, server_default="0")
    delivery_address = db.Column(db.Text, nullable=True)
    delivery_street_type = db.Column(db.String(40), nullable=True)
    delivery_street_name = db.Column(db.String(160), nullable=True)
    delivery_exterior_number = db.Column(db.String(40), nullable=True)
    delivery_interior_number = db.Column(db.String(40), nullable=True)
    delivery_settlement_type = db.Column(db.String(40), nullable=True)
    delivery_settlement_name = db.Column(db.String(160), nullable=True)
    delivery_postal_code = db.Column(db.String(10), nullable=True)
    delivery_locality = db.Column(db.String(160), nullable=True)
    delivery_municipality = db.Column(db.String(160), nullable=True)
    delivery_state = db.Column(db.String(120), nullable=True)
    delivery_country = db.Column(db.String(80), nullable=True)
    delivery_references = db.Column(db.Text, nullable=True)
    address_resolution_status = db.Column(db.String(40), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    payment_method = db.Column(Enum(PaymentMethod, native_enum=False), nullable=False)
    cash_change_for = db.Column(db.Numeric(10, 2), nullable=True)
    ai_call_summary = db.Column(db.Text, nullable=True)
    transcript_preview = db.Column(db.Text, nullable=True)
    source = db.Column(db.String(16), nullable=False, default="voice", server_default="voice")

    business = db.relationship("Business", back_populates="orders")
    customer = db.relationship("Customer", back_populates="orders")
    items = db.relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    status_history = db.relationship("OrderStatusHistory", back_populates="order", cascade="all, delete-orphan")
    source_call_log = db.relationship(
        "CallLog",
        back_populates="order",
        foreign_keys=[call_log_id],
        uselist=False,
    )


class OrderItem(db.Model, SerializerMixin):
    __tablename__ = "order_items"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id", ondelete="SET NULL"), nullable=True, index=True)
    name_snapshot = db.Column(db.String(160), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1, server_default="1")
    price = db.Column(db.Numeric(10, 2), nullable=False)
    notes = db.Column(db.Text, nullable=True)
    line_total = db.Column(db.Numeric(10, 2), nullable=False)

    order = db.relationship("Order", back_populates="items")
    modifiers = db.relationship("OrderItemModifier", back_populates="order_item", cascade="all, delete-orphan")


class OrderItemModifier(db.Model, SerializerMixin):
    __tablename__ = "order_item_modifiers"

    id = db.Column(db.Integer, primary_key=True)
    order_item_id = db.Column(db.Integer, db.ForeignKey("order_items.id", ondelete="CASCADE"), nullable=False, index=True)
    product_modifier_id = db.Column(db.Integer, db.ForeignKey("product_modifiers.id", ondelete="SET NULL"), nullable=True, index=True)
    name_snapshot = db.Column(db.String(160), nullable=False)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=db.func.now(), nullable=False)

    order_item = db.relationship("OrderItem", back_populates="modifiers")


class OrderStatusHistory(db.Model, SerializerMixin):
    __tablename__ = "order_status_history"

    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    status = db.Column(Enum(OrderStatus, native_enum=False), nullable=False)
    changed_by_type = db.Column(Enum(ChangedByType, native_enum=False), nullable=False)
    changed_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    changed_by_label = db.Column(db.String(120), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), server_default=db.func.now(), nullable=False)

    order = db.relationship("Order", back_populates="status_history")
