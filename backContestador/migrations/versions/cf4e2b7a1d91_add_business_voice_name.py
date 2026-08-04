"""add business voice name

Revision ID: cf4e2b7a1d91
Revises: a731d20f9c42
Create Date: 2026-08-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "cf4e2b7a1d91"
down_revision = "a731d20f9c42"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("business_settings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "voice_name",
                sa.String(length=32),
                server_default="Iapetus",
                nullable=False,
            )
        )


def downgrade():
    with op.batch_alter_table("business_settings") as batch_op:
        batch_op.drop_column("voice_name")
