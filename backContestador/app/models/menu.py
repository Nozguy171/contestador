from sqlalchemy import Enum

from app.extensions import db
from app.models.base import JSON_VARIANT, SerializerMixin, TimestampMixin
from app.models.enums import MenuRuleType


class Category(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())

    business = db.relationship("Business", back_populates="categories")
    products = db.relationship("Product", back_populates="category")

    __table_args__ = (db.UniqueConstraint("business_id", "name", name="uq_categories_business_name"),)


class Product(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    name = db.Column(db.String(160), nullable=False)
    description = db.Column(db.Text, nullable=True)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    image_url = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    is_sold_out = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())

    business = db.relationship("Business", back_populates="products")
    category = db.relationship("Category", back_populates="products")
    modifiers = db.relationship("ProductModifier", back_populates="product", cascade="all, delete-orphan")
    ingredients = db.relationship(
        "ProductIngredient",
        back_populates="product",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        db.CheckConstraint(
            "NOT (is_active AND is_sold_out)",
            name="ck_products_single_availability_state",
        ),
    )


class ProductModifier(db.Model, SerializerMixin):
    __tablename__ = "product_modifiers"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    group_name = db.Column(db.String(120), nullable=False, default="Personalización", server_default="Personalización")
    action = db.Column(db.String(16), nullable=False, default="choice", server_default="choice")
    price = db.Column(db.Numeric(10, 2), nullable=False, default=0, server_default="0")
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    sort_order = db.Column(db.Integer, nullable=False, default=0, server_default="0")

    product = db.relationship("Product", back_populates="modifiers")

    __table_args__ = (
        db.CheckConstraint(
            "action IN ('choice', 'add', 'remove')",
            name="ck_product_modifiers_action",
        ),
    )


class ProductIngredient(db.Model, SerializerMixin):
    __tablename__ = "product_ingredients"

    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(
        db.Integer,
        db.ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_item_id = db.Column(
        db.Integer,
        db.ForeignKey("inventory_items.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity = db.Column(db.Numeric(12, 3), nullable=False)

    product = db.relationship("Product", back_populates="ingredients")
    inventory_item = db.relationship("InventoryItem", back_populates="product_ingredients")

    __table_args__ = (
        db.UniqueConstraint(
            "product_id",
            "inventory_item_id",
            name="uq_product_ingredients_product_inventory_item",
        ),
        db.CheckConstraint("quantity > 0", name="ck_product_ingredients_quantity_positive"),
    )


class MenuRule(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "menu_rules"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    type = db.Column(Enum(MenuRuleType, native_enum=False), nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    config = db.Column(JSON_VARIANT, nullable=False, default=dict)

    business = db.relationship("Business", back_populates="menu_rules")
