"""add inventory groups recipes images alerts and movement history

Revision ID: e4b8a1c73d20
Revises: d91e6a2f4b70
Create Date: 2026-07-21 18:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e4b8a1c73d20"
down_revision = "d91e6a2f4b70"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "inventory_categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("color", sa.String(length=16), server_default="#64748b", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "name", name="uq_inventory_categories_business_name"),
    )
    op.create_index(
        op.f("ix_inventory_categories_business_id"),
        "inventory_categories",
        ["business_id"],
        unique=False,
    )

    with op.batch_alter_table("inventory_items") as batch_op:
        batch_op.add_column(sa.Column("category_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("image_url", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column(
                "low_stock_alert_enabled",
                sa.Boolean(),
                server_default=sa.true(),
                nullable=False,
            )
        )
        batch_op.create_foreign_key(
            "fk_inventory_items_category_id",
            "inventory_categories",
            ["category_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(op.f("ix_inventory_items_category_id"), ["category_id"], unique=False)

    op.create_table(
        "product_ingredients",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("inventory_item_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_product_ingredients_quantity_positive"),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "product_id",
            "inventory_item_id",
            name="uq_product_ingredients_product_inventory_item",
        ),
    )
    op.create_index(op.f("ix_product_ingredients_inventory_item_id"), "product_ingredients", ["inventory_item_id"], unique=False)
    op.create_index(op.f("ix_product_ingredients_product_id"), "product_ingredients", ["product_id"], unique=False)

    op.create_table(
        "inventory_movements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("inventory_item_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("movement_type", sa.String(length=24), nullable=False),
        sa.Column("quantity_delta", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("quantity_after", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("reason", sa.String(length=240), nullable=True),
        sa.Column("changed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("changed_by_label", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "movement_type IN ('initial', 'purchase', 'sale', 'waste', 'correction', 'reversal')",
            name="ck_inventory_movements_type",
        ),
        sa.CheckConstraint("quantity_after >= 0", name="ck_inventory_movements_quantity_after_nonnegative"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["inventory_item_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "inventory_item_id",
            "order_id",
            "movement_type",
            name="uq_inventory_movements_item_order_type",
        ),
    )
    op.create_index(op.f("ix_inventory_movements_business_id"), "inventory_movements", ["business_id"], unique=False)
    op.create_index(op.f("ix_inventory_movements_inventory_item_id"), "inventory_movements", ["inventory_item_id"], unique=False)
    op.create_index(op.f("ix_inventory_movements_order_id"), "inventory_movements", ["order_id"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_inventory_movements_order_id"), table_name="inventory_movements")
    op.drop_index(op.f("ix_inventory_movements_inventory_item_id"), table_name="inventory_movements")
    op.drop_index(op.f("ix_inventory_movements_business_id"), table_name="inventory_movements")
    op.drop_table("inventory_movements")
    op.drop_index(op.f("ix_product_ingredients_product_id"), table_name="product_ingredients")
    op.drop_index(op.f("ix_product_ingredients_inventory_item_id"), table_name="product_ingredients")
    op.drop_table("product_ingredients")
    with op.batch_alter_table("inventory_items") as batch_op:
        batch_op.drop_index(op.f("ix_inventory_items_category_id"))
        batch_op.drop_constraint("fk_inventory_items_category_id", type_="foreignkey")
        batch_op.drop_column("low_stock_alert_enabled")
        batch_op.drop_column("image_url")
        batch_op.drop_column("category_id")
    op.drop_index(op.f("ix_inventory_categories_business_id"), table_name="inventory_categories")
    op.drop_table("inventory_categories")
