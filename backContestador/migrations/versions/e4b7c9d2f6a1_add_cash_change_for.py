"""add cash change amount to orders

Revision ID: e4b7c9d2f6a1
Revises: cf4e2b7a1d91
Create Date: 2026-08-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e4b7c9d2f6a1"
down_revision = "cf4e2b7a1d91"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("orders") as batch_op:
        batch_op.add_column(sa.Column("cash_change_for", sa.Numeric(10, 2), nullable=True))


def downgrade():
    with op.batch_alter_table("orders") as batch_op:
        batch_op.drop_column("cash_change_for")
