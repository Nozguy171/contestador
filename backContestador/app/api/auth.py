from datetime import datetime, timezone

from flask import Blueprint, current_app, g, request
from flask_jwt_extended import create_access_token

from app.extensions import db
from app.models import Business, BusinessSetting, BusinessUser, User
from app.models.enums import BusinessRole
from app.utils.auth import require_auth
from app.utils.responses import error, success

bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")


@bp.post("/register")
def register():
    if not current_app.config.get("REGISTER_OPEN", True):
        return error("Registration is disabled", 403)

    data = request.get_json(silent=True) or {}
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    name = (data.get("name") or "").strip()
    business_name = (data.get("business_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    accepted_terms = bool(data.get("accepted_terms"))

    full_name = name or " ".join(part for part in [first_name, last_name] if part).strip()

    if not full_name or not business_name or not email or not password:
        return error("name, business_name, email and password are required", 400)

    if len(password) < 8:
        return error("Password must contain at least 8 characters", 400)

    if not accepted_terms:
        return error("Terms must be accepted", 400)

    if User.query.filter_by(email=email).first():
        return error("Email already in use", 409)

    user = User(
        name=full_name,
        first_name=first_name or full_name,
        last_name=last_name or None,
        email=email,
        is_active=True,
        terms_accepted_at=datetime.now(timezone.utc),
    )
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    businesses = []

    business = Business(name=business_name, email=email)
    business.settings = BusinessSetting()
    db.session.add(business)
    db.session.flush()

    membership = BusinessUser(
        business_id=business.id,
        user_id=user.id,
        role=BusinessRole.OWNER,
    )
    db.session.add(membership)
    businesses.append(
        {
            **business.to_dict(),
            "role": membership.role.value,
        }
    )

    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return success(
        {
            "access_token": token,
            "user": user.to_dict(exclude=["password_hash"]),
            "businesses": businesses,
        },
        "User created",
        201,
    )


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not user.is_active or not user.check_password(password):
        return error("Invalid credentials", 401)

    businesses = [
        {
            **membership.business.to_dict(),
            "role": membership.role.value,
        }
        for membership in user.memberships
    ]
    token = create_access_token(identity=str(user.id))
    return success(
        {
            "access_token": token,
            "user": user.to_dict(exclude=["password_hash"]),
            "businesses": businesses,
        },
        "Login successful",
    )


@bp.get("/me")
@require_auth
def me():
    user = g.current_user
    memberships = BusinessUser.query.filter_by(user_id=user.id).all()
    businesses = [
        {
            **membership.business.to_dict(),
            "role": membership.role.value,
        }
        for membership in memberships
    ]
    return success({"user": user.to_dict(exclude=["password_hash"]), "businesses": businesses})
