from sqlalchemy import JSON, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB

from app.extensions import db
from app.utils.serialization import serialize_value

JSON_VARIANT = JSON().with_variant(JSONB(), "postgresql")


class TimestampMixin:
    created_at = db.Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = db.Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SerializerMixin:
    def to_dict(self, exclude=None):
        exclude = set(exclude or [])
        data = {}
        for column in self.__table__.columns:
            if column.name in exclude:
                continue
            data[column.name] = serialize_value(getattr(self, column.name))
        return data
