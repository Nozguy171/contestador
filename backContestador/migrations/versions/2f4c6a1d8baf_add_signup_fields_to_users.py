"""add signup fields to users

Revision ID: 2f4c6a1d8baf
Revises: ad554b622eed
Create Date: 2026-04-18 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2f4c6a1d8baf"
down_revision = "ad554b622eed"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("first_name", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("last_name", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("terms_accepted_at")
        batch_op.drop_column("last_name")
        batch_op.drop_column("first_name")
