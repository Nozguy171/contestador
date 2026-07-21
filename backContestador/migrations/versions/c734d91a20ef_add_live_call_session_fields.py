"""add Gemini Live call session fields

Revision ID: c734d91a20ef
Revises: 4b91c5e8a072
Create Date: 2026-07-20 00:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c734d91a20ef"
down_revision = "4b91c5e8a072"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("businesses") as batch_op:
        batch_op.add_column(sa.Column("human_transfer_number", sa.String(length=32), nullable=True))

    with op.batch_alter_table("call_logs") as batch_op:
        batch_op.add_column(
            sa.Column("session_state", sa.String(length=32), server_default="ended", nullable=False)
        )
        batch_op.add_column(
            sa.Column(
                "draft_cart",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("transfer_requested", sa.Boolean(), server_default=sa.false(), nullable=False)
        )


def downgrade():
    with op.batch_alter_table("call_logs") as batch_op:
        batch_op.drop_column("transfer_requested")
        batch_op.drop_column("draft_cart")
        batch_op.drop_column("session_state")

    with op.batch_alter_table("businesses") as batch_op:
        batch_op.drop_column("human_transfer_number")
