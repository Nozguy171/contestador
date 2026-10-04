"""add voice diagnostics, structured address catalog and menu metadata

Revision ID: 9a41c8d75e20
Revises: e4b7c9d2f6a1
Create Date: 2026-10-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "9a41c8d75e20"
down_revision = "e4b7c9d2f6a1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "geo_catalog_versions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=24), server_default="INEGI", nullable=False),
        sa.Column("edition", sa.String(length=24), nullable=False),
        sa.Column("entity_code", sa.String(length=2), nullable=False),
        sa.Column("municipality_code", sa.String(length=3), nullable=False),
        sa.Column("entity_name", sa.String(length=120), nullable=True),
        sa.Column("municipality_name", sa.String(length=160), nullable=True),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("attribution", sa.Text(), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source", "edition", "entity_code", "municipality_code",
            name="uq_geo_catalog_version_scope",
        ),
    )

    op.create_table(
        "geo_localities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("catalog_version_id", sa.Integer(), nullable=False),
        sa.Column("locality_code", sa.String(length=4), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("normalized_name", sa.String(length=160), nullable=False),
        sa.ForeignKeyConstraint(["catalog_version_id"], ["geo_catalog_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("catalog_version_id", "locality_code", name="uq_geo_locality_version_code"),
    )
    op.create_index(
        "ix_geo_localities_version_name", "geo_localities",
        ["catalog_version_id", "normalized_name"], unique=False,
    )

    for table, key_name, name_column, max_name, type_column, type_length, constraint_name in [
        ("geo_streets", "source_key", "name", 160, "street_type", 40, "uq_geo_street_version_key"),
        ("geo_settlements", "source_key", "name", 200, "settlement_type", 40, "uq_geo_settlement_version_key"),
    ]:
        op.create_table(
            table,
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("catalog_version_id", sa.Integer(), nullable=False),
            sa.Column("locality_code", sa.String(length=4), nullable=False),
            sa.Column(key_name, sa.String(length=32), nullable=False),
            sa.Column(type_column, sa.String(length=type_length), nullable=True),
            sa.Column(name_column, sa.String(length=max_name), nullable=False),
            sa.Column("normalized_name", sa.String(length=max_name), nullable=False),
            sa.ForeignKeyConstraint(["catalog_version_id"], ["geo_catalog_versions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("catalog_version_id", key_name, name=constraint_name),
        )
        op.create_index(
            f"ix_{table}_version_locality_name", table,
            ["catalog_version_id", "locality_code", "normalized_name"], unique=False,
        )

    with op.batch_alter_table("businesses") as batch_op:
        batch_op.add_column(sa.Column("country_code", sa.String(length=2), nullable=True))
        batch_op.add_column(sa.Column("state_code", sa.String(length=2), nullable=True))
        batch_op.add_column(sa.Column("state_name", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("municipality_code", sa.String(length=3), nullable=True))
        batch_op.add_column(sa.Column("municipality_name", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("locality_code", sa.String(length=4), nullable=True))
        batch_op.add_column(sa.Column("locality_name", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("geo_catalog_version_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_businesses_geo_catalog_version_id", "geo_catalog_versions",
            ["geo_catalog_version_id"], ["id"], ondelete="SET NULL",
        )
        batch_op.create_index("ix_businesses_geo_catalog_version_id", ["geo_catalog_version_id"], unique=False)

    with op.batch_alter_table("business_settings") as batch_op:
        batch_op.add_column(sa.Column("voice_address_mode", sa.String(length=16), server_default="off", nullable=False))
        batch_op.add_column(sa.Column("voice_menu_v2_enabled", sa.Boolean(), server_default=sa.false(), nullable=False))
        batch_op.create_check_constraint(
            "ck_business_settings_voice_address_mode",
            "voice_address_mode IN ('off', 'shadow', 'candidate', 'enforce')",
        )

    with op.batch_alter_table("business_delivery_zones") as batch_op:
        batch_op.add_column(
            sa.Column("settlement_names", postgresql.JSONB(astext_type=sa.Text()),
                      server_default=sa.text("'[]'::jsonb"), nullable=False)
        )
        batch_op.add_column(
            sa.Column("settlement_keys", postgresql.JSONB(astext_type=sa.Text()),
                      server_default=sa.text("'[]'::jsonb"), nullable=False)
        )

    with op.batch_alter_table("products") as batch_op:
        batch_op.add_column(
            sa.Column("aliases", postgresql.JSONB(astext_type=sa.Text()),
                      server_default=sa.text("'[]'::jsonb"), nullable=False)
        )

    with op.batch_alter_table("product_modifiers") as batch_op:
        batch_op.add_column(sa.Column("is_required", sa.Boolean(), server_default=sa.false(), nullable=False))

    with op.batch_alter_table("call_logs") as batch_op:
        batch_op.add_column(
            sa.Column("voice_metrics", postgresql.JSONB(astext_type=sa.Text()),
                      server_default=sa.text("'{}'::jsonb"), nullable=False)
        )
        batch_op.add_column(sa.Column("gemini_model", sa.String(length=120), nullable=True))

    op.create_table(
        "call_log_transcript_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("call_log_id", sa.Integer(), nullable=False),
        sa.Column("receive_sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("speaker", sa.String(length=16), nullable=True),
        sa.Column("provider", sa.String(length=24), server_default="gemini_live", nullable=False),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()),
                  server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.ForeignKeyConstraint(["call_log_id"], ["call_logs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("call_log_id", "receive_sequence", name="uq_call_transcript_event_sequence"),
    )
    with op.batch_alter_table("orders") as batch_op:
        for name, length in [
            ("delivery_street_type", 40), ("delivery_street_name", 160),
            ("delivery_exterior_number", 40), ("delivery_interior_number", 40),
            ("delivery_settlement_type", 40), ("delivery_settlement_name", 160),
            ("delivery_postal_code", 10), ("delivery_locality", 160),
            ("delivery_municipality", 160), ("delivery_state", 120),
            ("delivery_country", 80),
        ]:
            batch_op.add_column(sa.Column(name, sa.String(length=length), nullable=True))
        batch_op.add_column(sa.Column("delivery_references", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("address_resolution_status", sa.String(length=40), nullable=True))


def downgrade():
    with op.batch_alter_table("orders") as batch_op:
        for column in [
            "address_resolution_status", "delivery_references", "delivery_country",
            "delivery_state", "delivery_municipality", "delivery_locality",
            "delivery_postal_code", "delivery_settlement_name", "delivery_settlement_type",
            "delivery_interior_number", "delivery_exterior_number", "delivery_street_name",
            "delivery_street_type",
        ]:
            batch_op.drop_column(column)

    op.drop_table("call_log_transcript_events")

    with op.batch_alter_table("call_logs") as batch_op:
        batch_op.drop_column("gemini_model")
        batch_op.drop_column("voice_metrics")

    with op.batch_alter_table("product_modifiers") as batch_op:
        batch_op.drop_column("is_required")
    with op.batch_alter_table("products") as batch_op:
        batch_op.drop_column("aliases")
    with op.batch_alter_table("business_delivery_zones") as batch_op:
        batch_op.drop_column("settlement_keys")
        batch_op.drop_column("settlement_names")
    with op.batch_alter_table("business_settings") as batch_op:
        batch_op.drop_constraint("ck_business_settings_voice_address_mode", type_="check")
        batch_op.drop_column("voice_menu_v2_enabled")
        batch_op.drop_column("voice_address_mode")
    with op.batch_alter_table("businesses") as batch_op:
        batch_op.drop_index("ix_businesses_geo_catalog_version_id")
        batch_op.drop_constraint("fk_businesses_geo_catalog_version_id", type_="foreignkey")
        for column in [
            "geo_catalog_version_id", "locality_name", "locality_code",
            "municipality_name", "municipality_code", "state_name", "state_code", "country_code",
        ]:
            batch_op.drop_column(column)

    for table in ["geo_settlements", "geo_streets", "geo_localities"]:
        index_names = {
            "geo_settlements": "ix_geo_settlements_version_locality_name",
            "geo_streets": "ix_geo_streets_version_locality_name",
            "geo_localities": "ix_geo_localities_version_name",
        }
        op.drop_index(index_names[table], table_name=table)
        op.drop_table(table)
    op.drop_table("geo_catalog_versions")
