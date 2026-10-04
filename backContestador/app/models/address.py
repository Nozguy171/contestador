from app.extensions import db
from app.models.base import SerializerMixin


class GeoCatalogVersion(db.Model, SerializerMixin):
    __tablename__ = "geo_catalog_versions"

    id = db.Column(db.Integer, primary_key=True)
    source = db.Column(db.String(24), nullable=False, default="INEGI", server_default="INEGI")
    edition = db.Column(db.String(24), nullable=False)
    entity_code = db.Column(db.String(2), nullable=False)
    municipality_code = db.Column(db.String(3), nullable=False)
    entity_name = db.Column(db.String(120), nullable=True)
    municipality_name = db.Column(db.String(160), nullable=True)
    checksum_sha256 = db.Column(db.String(64), nullable=False)
    source_url = db.Column(db.Text, nullable=False)
    attribution = db.Column(db.Text, nullable=False)
    imported_at = db.Column(db.DateTime(timezone=True), server_default=db.func.now(), nullable=False)

    localities = db.relationship("GeoLocality", back_populates="catalog_version", cascade="all, delete-orphan")
    streets = db.relationship("GeoStreet", back_populates="catalog_version", cascade="all, delete-orphan")
    settlements = db.relationship("GeoSettlement", back_populates="catalog_version", cascade="all, delete-orphan")

    __table_args__ = (
        db.UniqueConstraint("source", "edition", "entity_code", "municipality_code", name="uq_geo_catalog_version_scope"),
    )


class GeoLocality(db.Model, SerializerMixin):
    __tablename__ = "geo_localities"

    id = db.Column(db.Integer, primary_key=True)
    catalog_version_id = db.Column(db.Integer, db.ForeignKey("geo_catalog_versions.id", ondelete="CASCADE"), nullable=False)
    locality_code = db.Column(db.String(4), nullable=False)
    name = db.Column(db.String(160), nullable=False)
    normalized_name = db.Column(db.String(160), nullable=False)

    catalog_version = db.relationship("GeoCatalogVersion", back_populates="localities")

    __table_args__ = (
        db.UniqueConstraint("catalog_version_id", "locality_code", name="uq_geo_locality_version_code"),
        db.Index("ix_geo_localities_version_name", "catalog_version_id", "normalized_name"),
    )


class GeoStreet(db.Model, SerializerMixin):
    __tablename__ = "geo_streets"

    id = db.Column(db.Integer, primary_key=True)
    catalog_version_id = db.Column(db.Integer, db.ForeignKey("geo_catalog_versions.id", ondelete="CASCADE"), nullable=False)
    locality_code = db.Column(db.String(4), nullable=False)
    source_key = db.Column(db.String(32), nullable=False)
    street_type = db.Column(db.String(40), nullable=True)
    name = db.Column(db.String(160), nullable=False)
    normalized_name = db.Column(db.String(160), nullable=False)

    catalog_version = db.relationship("GeoCatalogVersion", back_populates="streets")

    __table_args__ = (
        db.UniqueConstraint("catalog_version_id", "source_key", name="uq_geo_street_version_key"),
        db.Index("ix_geo_streets_version_locality_name", "catalog_version_id", "locality_code", "normalized_name"),
    )


class GeoSettlement(db.Model, SerializerMixin):
    __tablename__ = "geo_settlements"

    id = db.Column(db.Integer, primary_key=True)
    catalog_version_id = db.Column(db.Integer, db.ForeignKey("geo_catalog_versions.id", ondelete="CASCADE"), nullable=False)
    locality_code = db.Column(db.String(4), nullable=False)
    source_key = db.Column(db.String(32), nullable=False)
    settlement_type = db.Column(db.String(40), nullable=True)
    name = db.Column(db.String(200), nullable=False)
    normalized_name = db.Column(db.String(200), nullable=False)

    catalog_version = db.relationship("GeoCatalogVersion", back_populates="settlements")

    __table_args__ = (
        db.UniqueConstraint("catalog_version_id", "source_key", name="uq_geo_settlement_version_key"),
        db.Index("ix_geo_settlements_version_locality_name", "catalog_version_id", "locality_code", "normalized_name"),
    )
