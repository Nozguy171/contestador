from app.extensions import db
from app.models.base import SerializerMixin, TimestampMixin


class Customer(TimestampMixin, SerializerMixin, db.Model):
    __tablename__ = "customers"

    id = db.Column(db.Integer, primary_key=True)
    business_id = db.Column(
        db.Integer,
        db.ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phone_number = db.Column(db.String(32), nullable=False)
    name = db.Column(db.String(160), nullable=True)
    last_call_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_order_at = db.Column(db.DateTime(timezone=True), nullable=True)

    business = db.relationship("Business", back_populates="customers")
    call_logs = db.relationship("CallLog", back_populates="customer")
    orders = db.relationship("Order", back_populates="customer")

    __table_args__ = (
        db.UniqueConstraint("business_id", "phone_number", name="uq_customers_business_phone"),
    )
