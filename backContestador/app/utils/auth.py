from functools import wraps

from flask import g, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models import Business, BusinessUser, User
from app.utils.responses import error

ROLE_RANK = {
    "viewer": 10,
    "agent": 20,
    "manager": 30,
    "admin": 40,
    "owner": 50,
}


def _resolve_current_user():
    user_id = get_jwt_identity()
    if not user_id:
        return None
    return db.session.get(User, int(user_id))


def require_auth(fn):
    @jwt_required()
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = _resolve_current_user()
        if not user or not user.is_active:
            return error("Unauthorized", 401)
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def require_business(min_role=None):
    def decorator(fn):
        @jwt_required()
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = _resolve_current_user()
            if not user or not user.is_active:
                return error("Unauthorized", 401)

            raw_business_id = request.headers.get("X-Business-Id") or request.args.get("business_id")
            if not raw_business_id:
                return error("X-Business-Id header is required", 400)

            try:
                business_id = int(raw_business_id)
            except ValueError:
                return error("Invalid business id", 400)

            membership = BusinessUser.query.filter_by(
                user_id=user.id,
                business_id=business_id,
            ).first()
            if not membership:
                return error("Forbidden for this business", 403)

            if min_role and ROLE_RANK.get(membership.role.value, 0) < ROLE_RANK.get(min_role, 0):
                return error("Insufficient permissions", 403)

            business = db.session.get(Business, business_id)
            if not business:
                return error("Business not found", 404)

            g.current_user = user
            g.current_membership = membership
            g.current_business = business
            return fn(*args, **kwargs)

        return wrapper

    return decorator
