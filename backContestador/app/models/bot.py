from sqlalchemy import Enum

from app.extensions import db
from app.models.base import SerializerMixin, TimestampMixin
from app.models.enums import BotTone, UnavailableBehavior


class BotConfig(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "bot_configs"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, unique=True)
    welcome_message = db.Column(db.Text, nullable=True)
    after_hours_message = db.Column(db.Text, nullable=True)
    fallback_message = db.Column(db.Text, nullable=True)
    confirmation_required = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    retry_count = db.Column(db.Integer, nullable=False, default=1, server_default="1")
    unavailable_behavior = db.Column(
        Enum(UnavailableBehavior, native_enum=False),
        nullable=False,
        default=UnavailableBehavior.ASK_CUSTOMER,
    )
    can_suggest_alternatives = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    tone = db.Column(Enum(BotTone, native_enum=False), nullable=False, default=BotTone.FRIENDLY)
    special_instructions = db.Column(db.Text, nullable=True)

    business = db.relationship("Business", back_populates="bot_config")
