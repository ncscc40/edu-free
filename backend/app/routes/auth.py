from flask import Blueprint, request
from flask_jwt_extended import create_access_token, create_refresh_token, get_jwt_identity, jwt_required

from ..extensions import db, limiter
from ..models import Department, User
from ..services.auth_service import create_student, find_user_by_identifier
from ..utils.responses import error_response, success_response


auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/create-admin")
@limiter.limit("5/minute")
def create_admin():
    payload = request.get_json(silent=True) or {}

    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not name or not email or not password:
        return error_response("name, email, and password are required", 400)

    if len(password) < 8:
        return error_response("Password must be at least 8 characters long", 400)

    if User.query.filter_by(email=email).first():
        return error_response("Admin email already exists", 409)

    admin = User(name=name, email=email, role="admin")
    admin.set_password(password)

    db.session.add(admin)
    db.session.commit()

    return success_response(
        "Admin created successfully",
        {
            "id": admin.id,
            "name": admin.name,
            "email": admin.email,
            "role": admin.role,
        },
        201,
    )


@auth_bp.post("/register-student")
@limiter.limit("10/minute")
def register_student():
    payload = request.get_json(silent=True) or {}

    name = (payload.get("name") or "").strip()
    uid = (payload.get("uid") or "").strip()
    password = payload.get("password") or ""
    department_id = payload.get("department")

    if not all([name, uid, password, department_id]):
        return error_response("name, uid, password, and department are required", 400)

    if len(password) < 8:
        return error_response("Password must be at least 8 characters long", 400)

    department = Department.query.get(department_id)
    if not department:
        return error_response("Department does not exist", 400)

    existing = User.query.filter_by(uid=uid).first()
    if existing:
        return error_response("Student UID already exists", 409)

    student = create_student(name=name, uid=uid, password=password, department_id=department.id)

    return success_response(
        "Student registered successfully",
        {
            "id": student.id,
            "name": student.name,
            "uid": student.uid,
            "department": {"id": department.id, "name": department.name},
        },
        201,
    )


@auth_bp.post("/login")
@limiter.limit("20/minute")
def login():
    payload = request.get_json(silent=True) or {}
    identifier = (payload.get("uid") or payload.get("email") or "").strip()
    password = payload.get("password") or ""

    if not identifier or not password:
        return error_response("uid/email and password are required", 400)

    user = find_user_by_identifier(identifier)
    if not user or not user.verify_password(password):
        return error_response("Invalid credentials", 401)

    additional_claims = {"role": user.role, "department_id": user.department_id}
    access_token = create_access_token(identity=str(user.id), additional_claims=additional_claims)
    refresh_token = create_refresh_token(identity=str(user.id), additional_claims=additional_claims)

    return success_response(
        "Login successful",
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": {
                "id": user.id,
                "name": user.name,
                "uid": user.uid,
                "email": user.email,
                "role": user.role,
                "department_id": user.department_id,
            },
        },
    )


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
@limiter.limit("30/minute")
def refresh():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return error_response("User not found", 404)

    access_token = create_access_token(
        identity=str(user.id),
        additional_claims={"role": user.role, "department_id": user.department_id},
    )
    return success_response("Token refreshed", {"access_token": access_token})
