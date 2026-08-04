from app.extensions import db
from app.models.base import SerializerMixin, TimestampMixin


class InventoryCategory(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "inventory_categories"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(
        db.Integer,
        db.ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = db.Column(db.String(120), nullable=False)
    color = db.Column(db.String(16), nullable=False, default="#64748b", server_default="#64748b")

    business = db.relationship("Business", back_populates="inventory_categories")
    items = db.relationship("InventoryItem", back_populates="category")

    __table_args__ = (
        db.UniqueConstraint(
            "business_id",
            "name",
            name="uq_inventory_categories_business_name",
        ),
    )


class InventoryItem(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "inventory_items"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(
        db.Integer,
        db.ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id = db.Column(
        db.Integer,
        db.ForeignKey("inventory_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name = db.Column(db.String(160), nullable=False)
    unit = db.Column(db.String(32), nullable=False, default="unidad", server_default="unidad")
    quantity = db.Column(db.Numeric(12, 3), nullable=False, default=0, server_default="0")
    minimum_quantity = db.Column(db.Numeric(12, 3), nullable=False, default=0, server_default="0")
    cost_per_unit = db.Column(db.Numeric(10, 2), nullable=False, default=0, server_default="0")
    image_url = db.Column(db.Text, nullable=True)
    low_stock_alert_enabled = db.Column(
        db.Boolean,
        nullable=False,
        default=True,
        server_default=db.true(),
    )
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())

    business = db.relationship("Business", back_populates="inventory_items")
    category = db.relationship("InventoryCategory", back_populates="items")
    movements = db.relationship(
        "InventoryMovement",
        back_populates="inventory_item",
        cascade="all, delete-orphan",
    )
    product_ingredients = db.relationship(
        "ProductIngredient",
        back_populates="inventory_item",
    )

    __table_args__ = (
        db.UniqueConstraint("business_id", "name", name="uq_inventory_items_business_name"),
        db.CheckConstraint("quantity >= 0", name="ck_inventory_items_quantity_nonnegative"),
        db.CheckConstraint(
            "minimum_quantity >= 0",
            name="ck_inventory_items_minimum_nonnegative",
        ),
        db.CheckConstraint("cost_per_unit >= 0", name="ck_inventory_items_cost_nonnegative"),
    )


class InventoryMovement(SerializerMixin, db.Model):
    __tablename__ = "inventory_movements"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(
        db.Integer,
        db.ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_item_id = db.Column(
        db.Integer,
        db.ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_id = db.Column(
        db.Integer,
        db.ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    movement_type = db.Column(db.String(24), nullable=False)
    quantity_delta = db.Column(db.Numeric(12, 3), nullable=False)
    quantity_after = db.Column(db.Numeric(12, 3), nullable=False)
    reason = db.Column(db.String(240), nullable=True)
    changed_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    changed_by_label = db.Column(db.String(120), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        server_default=db.func.now(),
        nullable=False,
    )

    inventory_item = db.relationship("InventoryItem", back_populates="movements")
    order = db.relationship("Order")

    __table_args__ = (
        db.CheckConstraint(
            "movement_type IN ('initial', 'purchase', 'sale', 'waste', 'correction', 'reversal')",
            name="ck_inventory_movements_type",
        ),
        db.CheckConstraint(
            "quantity_after >= 0",
            name="ck_inventory_movements_quantity_after_nonnegative",
        ),
        db.UniqueConstraint(
            "inventory_item_id",
            "order_id",
            "movement_type",
            name="uq_inventory_movements_item_order_type",
        ),
    )
