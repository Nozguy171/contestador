"""add customers and dedicated Twilio number

Revision ID: 4b91c5e8a072
Revises: 8c17b8ce9a21
Create Date: 2026-07-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "4b91c5e8a072"
down_revision = "8c17b8ce9a21"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("businesses") as batch_op:
        batch_op.add_column(sa.Column("twilio_phone_number", sa.String(length=32), nullable=True))
        batch_op.create_index("ix_businesses_twilio_phone_number", ["twilio_phone_number"], unique=True)

    op.create_table(
        "customers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("business_id", sa.Integer(), nullable=False),
        sa.Column("phone_number", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=True),
        sa.Column("last_call_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_order_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("business_id", "phone_number", name="uq_customers_business_phone"),
    )
    op.create_index("ix_customers_business_id", "customers", ["business_id"])

    with op.batch_alter_table("call_logs") as batch_op:
        batch_op.add_column(sa.Column("customer_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_call_logs_customer_id", ["customer_id"])
        batch_op.create_foreign_key(
            "fk_call_logs_customer_id_customers",
            "customers",
            ["customer_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(sa.Column("customer_id", sa.Integer(), nullable=True))
        batch_op.create_index("ix_orders_customer_id", ["customer_id"])
        batch_op.create_foreign_key(
            "fk_orders_customer_id_customers",
            "customers",
            ["customer_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.execute(
        """
        INSERT INTO customers (business_id, phone_number, name, last_call_at, last_order_at)
        SELECT business_id, phone_number, MAX(customer_name), NULL, MAX(created_at)
        FROM orders
        GROUP BY business_id, phone_number
        ON CONFLICT (business_id, phone_number) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO customers (business_id, phone_number, last_call_at)
        SELECT business_id, phone_number, MAX(start_time)
        FROM call_logs
        GROUP BY business_id, phone_number
        ON CONFLICT (business_id, phone_number)
        DO UPDATE SET last_call_at = EXCLUDED.last_call_at
        """
    )
    op.execute(
        """
        UPDATE orders
        SET customer_id = customers.id
        FROM customers
        WHERE orders.business_id = customers.business_id
          AND orders.phone_number = customers.phone_number
        """
    )
    op.execute(
        """
        UPDATE call_logs
        SET customer_id = customers.id
        FROM customers
        WHERE call_logs.business_id = customers.business_id
          AND call_logs.phone_number = customers.phone_number
        """
    )


def downgrade():
    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_constraint("fk_orders_customer_id_customers", type_="foreignkey")
        batch_op.drop_index("ix_orders_customer_id")
        batch_op.drop_column("customer_id")
    with op.batch_alter_table("call_logs") as batch_op:
        batch_op.drop_constraint("fk_call_logs_customer_id_customers", type_="foreignkey")
        batch_op.drop_index("ix_call_logs_customer_id")
        batch_op.drop_column("customer_id")
    op.drop_index("ix_customers_business_id", table_name="customers")
    op.drop_table("customers")
    with op.batch_alter_table("businesses") as batch_op:
        batch_op.drop_index("ix_businesses_twilio_phone_number")
        batch_op.drop_column("twilio_phone_number")
