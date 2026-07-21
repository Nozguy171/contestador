"""add provider fields to call logs

Revision ID: 8c17b8ce9a21
Revises: 2f4c6a1d8baf
Create Date: 2026-04-19 11:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "8c17b8ce9a21"
down_revision = "2f4c6a1d8baf"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("call_logs", schema=None) as batch_op:
        batch_op.add_column(sa.Column("to_number", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("provider_call_sid", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("provider_stream_sid", sa.String(length=64), nullable=True))
        batch_op.create_index(batch_op.f("ix_call_logs_provider_call_sid"), ["provider_call_sid"], unique=False)
        batch_op.create_index(batch_op.f("ix_call_logs_provider_stream_sid"), ["provider_stream_sid"], unique=False)


def downgrade():
    with op.batch_alter_table("call_logs", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_call_logs_provider_stream_sid"))
        batch_op.drop_index(batch_op.f("ix_call_logs_provider_call_sid"))
        batch_op.drop_column("provider_stream_sid")
        batch_op.drop_column("provider_call_sid")
        batch_op.drop_column("to_number")
