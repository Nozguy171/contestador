"""add POS source, inventory and structured product options

Revision ID: d91e6a2f4b70
Revises: c734d91a20ef
Create Date: 2026-07-21 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "d91e6a2f4b70"
down_revision = "c734d91a20ef"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("business_settings") as batch_op:
        batch_op.add_column(
            sa.Column("voice_enabled", sa.Boolean(), server_default=sa.true(), nullable=False)
        )

    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(
            sa.Column("source", sa.String(length=16), server_default="voice", nullable=False)
        )

    with op.batch_alter_table("product_modifiers") as batch_op:
        batch_op.add_column(
            sa.Column(
                "group_name",
                sa.String(length=120),
                server_default="Personalización",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("action", sa.String(length=16), server_default="choice", nullable=False)
        )
        batch_op.create_check_constraint(
            "ck_product_modifiers_action",
            "action IN ('choice', 'add', 'remove')",
        )

    op.execute("UPDATE products SET is_active = false WHERE is_active = true AND is_sold_out = true")
    with op.batch_alter_table("products") as batch_op:
        batch_op.create_check_constraint(
            "ck_products_single_availability_state",
            "NOT (is_active AND is_sold_out)",
        )

    op.create_table(
        "inventory_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("unit", sa.String(length=32), server_default="unidad", nullable=False),
        sa.Column("quantity", sa.Numeric(precision=12, scale=3), server_default="0", nullable=False),
        sa.Column(
            "minimum_quantity",
            sa.Numeric(precision=12, scale=3),
            server_default="0",
            nullable=False,
        ),
        sa.Column(
            "cost_per_unit",
            sa.Numeric(precision=10, scale=2),
            server_default="0",
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("cost_per_unit >= 0", name="ck_inventory_items_cost_nonnegative"),
        sa.CheckConstraint(
            "minimum_quantity >= 0",
            name="ck_inventory_items_minimum_nonnegative",
        ),
        sa.CheckConstraint("quantity >= 0", name="ck_inventory_items_quantity_nonnegative"),
        sa.ForeignKeyConstraint(
            ["business_id"],
            ["businesses.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "name", name="uq_inventory_items_business_name"),
    )
    op.create_index(
        op.f("ix_inventory_items_business_id"),
        "inventory_items",
        ["business_id"],
        unique=False,
    )


def downgrade():
    op.drop_index(op.f("ix_inventory_items_business_id"), table_name="inventory_items")
    op.drop_table("inventory_items")

    with op.batch_alter_table("products") as batch_op:
        batch_op.drop_constraint("ck_products_single_availability_state", type_="check")

    with op.batch_alter_table("product_modifiers") as batch_op:
        batch_op.drop_constraint("ck_product_modifiers_action", type_="check")
        batch_op.drop_column("action")
        batch_op.drop_column("group_name")

    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_column("source")

    with op.batch_alter_table("business_settings") as batch_op:
        batch_op.drop_column("voice_enabled")
