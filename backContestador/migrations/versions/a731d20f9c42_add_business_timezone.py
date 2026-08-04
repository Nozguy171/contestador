"""add business timezone

Revision ID: a731d20f9c42
Revises: f6a2c9d1e840
Create Date: 2026-07-21 21:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a731d20f9c42"
down_revision = "f6a2c9d1e840"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("business_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "timezone",
                sa.String(length=64),
                server_default="America/Mexico_City",
                nullable=False,
            )
        )


def downgrade():
    with op.batch_alter_table("business_settings") as batch_op:
        batch_op.drop_column("timezone")
