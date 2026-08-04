"""add structured promotions discounts and optional insights

Revision ID: f6a2c9d1e840
Revises: e4b8a1c73d20
Create Date: 2026-07-21 20:15:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f6a2c9d1e840"
down_revision = "e4b8a1c73d20"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("business_settings") as batch_op:
        batch_op.add_column(
            sa.Column("insights_enabled", sa.Boolean(), server_default=sa.false(), nullable=False)
        )

    with op.batch_alter_table("business_promotions") as batch_op:
        batch_op.add_column(sa.Column("name", sa.String(length=160), server_default="Promoción", nullable=False))
        batch_op.add_column(sa.Column("promotion_type", sa.String(length=32), server_default="percentage", nullable=False))
        batch_op.add_column(sa.Column("value", sa.Numeric(precision=6, scale=2), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("scope_type", sa.String(length=24), server_default="all", nullable=False))
        batch_op.add_column(sa.Column("product_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("category_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("days_of_week", sa.JSON(), server_default=sa.text("'[]'"), nullable=False))
        batch_op.create_foreign_key("fk_business_promotions_product_id", "products", ["product_id"], ["id"], ondelete="SET NULL")
        batch_op.create_foreign_key("fk_business_promotions_category_id", "categories", ["category_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index(op.f("ix_business_promotions_product_id"), ["product_id"], unique=False)
        batch_op.create_index(op.f("ix_business_promotions_category_id"), ["category_id"], unique=False)
        batch_op.create_check_constraint(
            "ck_business_promotions_type",
            "promotion_type IN ('percentage', 'two_for_one', 'second_half')",
        )
        batch_op.create_check_constraint(
            "ck_business_promotions_scope",
            "scope_type IN ('all', 'category', 'product')",
        )
        batch_op.create_check_constraint(
            "ck_business_promotions_value",
            "value >= 0 AND value <= 100",
        )

    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(sa.Column("discount", sa.Numeric(precision=10, scale=2), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("promotion_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("promotion_name_snapshot", sa.String(length=160), nullable=True))
        batch_op.create_foreign_key("fk_orders_promotion_id", "business_promotions", ["promotion_id"], ["id"], ondelete="SET NULL")
        batch_op.create_index(op.f("ix_orders_promotion_id"), ["promotion_id"], unique=False)


def downgrade():
    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_index(op.f("ix_orders_promotion_id"))
        batch_op.drop_constraint("fk_orders_promotion_id", type_="foreignkey")
        batch_op.drop_column("promotion_name_snapshot")
        batch_op.drop_column("promotion_id")
        batch_op.drop_column("discount")

    with op.batch_alter_table("business_promotions") as batch_op:
        batch_op.drop_constraint("ck_business_promotions_value", type_="check")
        batch_op.drop_constraint("ck_business_promotions_scope", type_="check")
        batch_op.drop_constraint("ck_business_promotions_type", type_="check")
        batch_op.drop_index(op.f("ix_business_promotions_category_id"))
        batch_op.drop_index(op.f("ix_business_promotions_product_id"))
        batch_op.drop_constraint("fk_business_promotions_category_id", type_="foreignkey")
        batch_op.drop_constraint("fk_business_promotions_product_id", type_="foreignkey")
        batch_op.drop_column("days_of_week")
        batch_op.drop_column("category_id")
        batch_op.drop_column("product_id")
        batch_op.drop_column("scope_type")
        batch_op.drop_column("value")
        batch_op.drop_column("promotion_type")
        batch_op.drop_column("name")

    with op.batch_alter_table("business_settings") as batch_op:
        batch_op.drop_column("insights_enabled")
