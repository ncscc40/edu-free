from flask import Blueprint, request
from flask_jwt_extended import get_jwt, verify_jwt_in_request
from sqlalchemy.exc import IntegrityError

from ..extensions import db, limiter
from ..models import Course, Department, TeacherDepartment, User
from ..utils.decorators import role_required
from ..utils.responses import error_response, success_response


admin_bp = Blueprint("admin", __name__)


@admin_bp.post("/create-teacher")
@role_required("admin")
@limiter.limit("10/minute")
def create_teacher():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    password = payload.get("password") or ""
    email = (payload.get("email") or "").strip() or None

    if not name or not password:
        return error_response("name and password are required", 400)

    if len(password) < 8:
        return error_response("Password must be at least 8 characters long", 400)

    teacher = User(name=name, email=email, role="teacher")
    teacher.set_password(password)
    db.session.add(teacher)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error_response("Teacher email already exists", 409)

    return success_response(
        "Teacher created successfully",
        {
            "id": teacher.id,
            "name": teacher.name,
            "email": teacher.email,
            "role": teacher.role,
        },
        201,
    )


@admin_bp.post("/create-department")
@role_required("admin")
@limiter.limit("10/minute")
def create_department():
    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()

    if not name:
        return error_response("Department name is required", 400)

    department = Department(name=name)
    db.session.add(department)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return error_response("Department already exists", 409)

    return success_response(
        "Department created successfully",
        {"id": department.id, "name": department.name},
        201,
    )


@admin_bp.post("/assign-department")
@role_required("admin")
@limiter.limit("20/minute")
def assign_department():
    payload = request.get_json(silent=True) or {}
    teacher_id = payload.get("teacher_id")
    department_ids = payload.get("department_ids") or []

    if not teacher_id or not isinstance(department_ids, list) or not department_ids:
        return error_response("teacher_id and department_ids (list) are required", 400)

    teacher = User.query.filter_by(id=teacher_id, role="teacher").first()
    if not teacher:
        return error_response("Teacher not found", 404)

    departments = Department.query.filter(Department.id.in_(department_ids)).all()
    if len(departments) != len(set(department_ids)):
        return error_response("One or more departments are invalid", 400)

    assigned = []
    for department in departments:
        exists = TeacherDepartment.query.filter_by(
            teacher_id=teacher.id, department_id=department.id
        ).first()
        if not exists:
            db.session.add(TeacherDepartment(teacher_id=teacher.id, department_id=department.id))
        assigned.append({"id": department.id, "name": department.name})

    db.session.commit()

    return success_response(
        "Departments assigned successfully",
        {
            "teacher": {"id": teacher.id, "name": teacher.name, "email": teacher.email},
            "departments": assigned,
        },
    )


@admin_bp.get("/teachers")
@role_required("admin")
def list_teachers():
    teachers = User.query.filter_by(role="teacher").all()
    data = []
    for teacher in teachers:
        assigned = [
            {"id": dept.id, "name": dept.name}
            for dept in teacher.departments.order_by(Department.name.asc()).all()
        ]
        data.append(
            {
                "id": teacher.id,
                "name": teacher.name,
                "email": teacher.email,
                "departments": assigned,
            }
        )

    return success_response("Teachers fetched successfully", {"teachers": data})


@admin_bp.get("/departments")
def list_departments():
    verify_jwt_in_request(optional=True)
    claims = get_jwt() if request.headers.get("Authorization") else {}
    role = claims.get("role")

    departments = Department.query.order_by(Department.name.asc()).all()
    data = []
    for department in departments:
        if role == "admin":
            teachers = [
                {"id": teacher.id, "name": teacher.name, "email": teacher.email}
                for teacher in department.teachers.order_by(User.name.asc()).all()
            ]
            data.append({"id": department.id, "name": department.name, "teachers": teachers})
        else:
            data.append({"id": department.id, "name": department.name})

    return success_response("Departments fetched successfully", {"departments": data})


@admin_bp.put("/teacher/<int:teacher_id>")
@role_required("admin")
@limiter.limit("20/minute")
def update_teacher(teacher_id: int):
    teacher = User.query.filter_by(id=teacher_id, role="teacher").first()
    if not teacher:
        return error_response("Teacher not found", 404)

    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    email = payload.get("email")

    if name is not None:
        name = name.strip()
        if not name:
            return error_response("name cannot be empty", 400)
        teacher.name = name

    if email is not None:
        email = email.strip() or None
        if email and User.query.filter(User.email == email, User.id != teacher.id).first():
            return error_response("Teacher email already exists", 409)
        teacher.email = email

    db.session.commit()
    return success_response(
        "Teacher updated successfully",
        {"id": teacher.id, "name": teacher.name, "email": teacher.email, "role": teacher.role},
    )


@admin_bp.delete("/teacher/<int:teacher_id>")
@role_required("admin")
@limiter.limit("10/minute")
def delete_teacher(teacher_id: int):
    teacher = User.query.filter_by(id=teacher_id, role="teacher").first()
    if not teacher:
        return error_response("Teacher not found", 404)

    if Course.query.filter_by(teacher_id=teacher.id).count() > 0:
        return error_response("Cannot delete teacher with existing courses", 400)

    TeacherDepartment.query.filter_by(teacher_id=teacher.id).delete()
    db.session.delete(teacher)
    db.session.commit()
    return success_response("Teacher deleted successfully", {"id": teacher_id})


@admin_bp.put("/department/<int:department_id>")
@role_required("admin")
@limiter.limit("20/minute")
def update_department(department_id: int):
    department = Department.query.get(department_id)
    if not department:
        return error_response("Department not found", 404)

    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return error_response("Department name is required", 400)

    existing = Department.query.filter(Department.name == name, Department.id != department.id).first()
    if existing:
        return error_response("Department already exists", 409)

    department.name = name
    db.session.commit()
    return success_response("Department updated successfully", {"id": department.id, "name": department.name})


@admin_bp.delete("/department/<int:department_id>")
@role_required("admin")
@limiter.limit("10/minute")
def delete_department(department_id: int):
    department = Department.query.get(department_id)
    if not department:
        return error_response("Department not found", 404)

    if User.query.filter_by(role="student", department_id=department.id).count() > 0:
        return error_response("Cannot delete department with students", 400)
    if Course.query.filter_by(department_id=department.id).count() > 0:
        return error_response("Cannot delete department with courses", 400)

    TeacherDepartment.query.filter_by(department_id=department.id).delete()
    db.session.delete(department)
    db.session.commit()
    return success_response("Department deleted successfully", {"id": department_id})
