from sqlalchemy import Enum

from app.extensions import db
from app.models.base import JSON_VARIANT, SerializerMixin, TimestampMixin
from app.models.enums import BusinessRole


class Business(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "businesses"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    address = db.Column(db.Text, nullable=True)
    phone = db.Column(db.String(32), nullable=True)
    twilio_phone_number = db.Column(db.String(32), nullable=True, unique=True, index=True)
    human_transfer_number = db.Column(db.String(32), nullable=True)
    email = db.Column(db.String(255), nullable=True)
    estimated_delivery_time = db.Column(db.String(120), nullable=True)

    users = db.relationship("BusinessUser", back_populates="business", cascade="all, delete-orphan")
    hours = db.relationship("BusinessHour", back_populates="business", cascade="all, delete-orphan")
    settings = db.relationship("BusinessSetting", back_populates="business", uselist=False, cascade="all, delete-orphan")
    delivery_zones = db.relationship("BusinessDeliveryZone", back_populates="business", cascade="all, delete-orphan")
    promotions = db.relationship("BusinessPromotion", back_populates="business", cascade="all, delete-orphan")
    policies = db.relationship("BusinessPolicy", back_populates="business", cascade="all, delete-orphan")
    faqs = db.relationship("FAQ", back_populates="business", cascade="all, delete-orphan")
    bot_config = db.relationship("BotConfig", back_populates="business", uselist=False, cascade="all, delete-orphan")
    categories = db.relationship("Category", back_populates="business", cascade="all, delete-orphan")
    products = db.relationship("Product", back_populates="business", cascade="all, delete-orphan")
    menu_rules = db.relationship("MenuRule", back_populates="business", cascade="all, delete-orphan")
    orders = db.relationship("Order", back_populates="business", cascade="all, delete-orphan")
    call_logs = db.relationship("CallLog", back_populates="business", cascade="all, delete-orphan")
    customers = db.relationship("Customer", back_populates="business", cascade="all, delete-orphan")
    inventory_items = db.relationship("InventoryItem", back_populates="business", cascade="all, delete-orphan")
    inventory_categories = db.relationship(
        "InventoryCategory",
        back_populates="business",
        cascade="all, delete-orphan",
    )


class BusinessUser(db.Model, SerializerMixin):
    __tablename__ = "business_users"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = db.Column(Enum(BusinessRole, native_enum=False), nullable=False, default=BusinessRole.OWNER)
    created_at = db.Column(db.DateTime(timezone=True), server_default=db.func.now(), nullable=False)

    business = db.relationship("Business", back_populates="users")
    user = db.relationship("User", back_populates="memberships")

    __table_args__ = (db.UniqueConstraint("business_id", "user_id", name="uq_business_users_business_user"),)


class BusinessHour(db.Model, SerializerMixin):
    __tablename__ = "business_hours"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week = db.Column(db.Integer, nullable=False)
    open_time = db.Column(db.Time, nullable=True)
    close_time = db.Column(db.Time, nullable=True)
    is_closed = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())

    business = db.relationship("Business", back_populates="hours")

    __table_args__ = (db.UniqueConstraint("business_id", "day_of_week", name="uq_business_hours_business_day"),)


class BusinessSetting(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "business_settings"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, unique=True)
    delivery_enabled = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    minimum_order_delivery = db.Column(db.Numeric(10, 2), nullable=True)
    delivery_fee = db.Column(db.Numeric(10, 2), nullable=True)
    free_delivery_threshold = db.Column(db.Numeric(10, 2), nullable=True)
    estimated_prep_time_minutes = db.Column(db.Integer, nullable=True)
    accept_cash = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    accept_card = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    accept_online = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    cash_only_threshold = db.Column(db.Numeric(10, 2), nullable=True)
    require_prepayment = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    voice_enabled = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    insights_enabled = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    timezone = db.Column(
        db.String(64),
        nullable=False,
        default="America/Mexico_City",
        server_default="America/Mexico_City",
    )

    business = db.relationship("Business", back_populates="settings")


class BusinessDeliveryZone(db.Model, SerializerMixin):
    __tablename__ = "business_delivery_zones"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())

    business = db.relationship("Business", back_populates="delivery_zones")


class BusinessPromotion(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "business_promotions"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    text = db.Column(db.Text, nullable=False)
    promotion_type = db.Column(db.String(32), nullable=False)
    value = db.Column(db.Numeric(6, 2), nullable=False, default=0, server_default="0")
    scope_type = db.Column(db.String(24), nullable=False, default="all", server_default="all")
    product_id = db.Column(
        db.Integer,
        db.ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    category_id = db.Column(
        db.Integer,
        db.ForeignKey("categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    days_of_week = db.Column(JSON_VARIANT, nullable=False, default=list, server_default="[]")
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    starts_at = db.Column(db.DateTime(timezone=True), nullable=True)
    ends_at = db.Column(db.DateTime(timezone=True), nullable=True)

    business = db.relationship("Business", back_populates="promotions")

    __table_args__ = (
        db.CheckConstraint(
            "promotion_type IN ('percentage', 'two_for_one', 'second_half')",
            name="ck_business_promotions_type",
        ),
        db.CheckConstraint(
            "scope_type IN ('all', 'category', 'product')",
            name="ck_business_promotions_scope",
        ),
        db.CheckConstraint("value >= 0 AND value <= 100", name="ck_business_promotions_value"),
    )


class BusinessPolicy(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "business_policies"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    text = db.Column(db.Text, nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())

    business = db.relationship("Business", back_populates="policies")
