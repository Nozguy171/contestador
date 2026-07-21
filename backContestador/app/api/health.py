from flask import Blueprint
from sqlalchemy import text

from app.extensions import db
from app.utils.responses import success

bp = Blueprint("health", __name__, url_prefix="/api/v1")


@bp.get("/health")
def health():
    db.session.execute(text("SELECT 1"))
    return success({"status": "healthy"})
