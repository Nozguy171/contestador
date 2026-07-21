from app.extensions import db
from app.models.base import SerializerMixin, TimestampMixin


class FAQ(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "faqs"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(db.Integer, db.ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    category = db.Column(db.String(120), nullable=True)
    question = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())

    business = db.relationship("Business", back_populates="faqs")
