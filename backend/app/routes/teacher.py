"""Teacher routes -- course CRUD, resource management, comments."""

import os
import uuid

from flask import Blueprint, current_app, request
from flask_jwt_extended import get_jwt_identity
from werkzeug.utils import secure_filename

from ..extensions import db, limiter
from ..models import Course, CourseResource, Department, Notification, ResourceComment, TeacherDepartment, User
from ..serializers import serialize_comment, serialize_course, serialize_resource, serialize_resource_comments
from ..services.course_service import create_course, create_resource
from ..services.notification_service import (
    notify_comment_reply,
    notify_students_new_upload,
    serialize_notification,
)
from ..utils.decorators import role_required
from ..utils.responses import error_response, success_response
from ..utils.validators import allowed_file, is_valid_url


teacher_bp = Blueprint("teacher", __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_teacher() -> User | None:
    """Return the current authenticated teacher or None."""
    return User.query.filter_by(id=int(get_jwt_identity()), role="teacher").first()


def _get_teacher_owned_resource(teacher_id: int, resource_id: int) -> CourseResource | None:
    """Return a resource only if the teacher owns the parent course."""
    return (
        db.session.query(CourseResource)
        .join(Course, Course.id == CourseResource.course_id)
        .filter(Course.teacher_id == teacher_id, CourseResource.id == resource_id)
        .first()
    )


# ---------------------------------------------------------------------------
# Department info
# ---------------------------------------------------------------------------

@teacher_bp.get("/my-departments")
@role_required("teacher")
def my_departments():
    """List departments assigned to the current teacher."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    departments = [
        {"id": d.id, "name": d.name}
        for d in teacher.departments.order_by(Department.name.asc()).all()
    ]
    return success_response("Assigned departments fetched", {"departments": departments})


# ---------------------------------------------------------------------------
# Course CRUD
# ---------------------------------------------------------------------------

@teacher_bp.post("/create-course")
@role_required("teacher")
@limiter.limit("30/minute")
def create_course_route():
    """Create a new course in an assigned department."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    payload = request.get_json(silent=True) or {}
    name = (payload.get("name") or "").strip()
    description = (payload.get("description") or "").strip()
    department_id = payload.get("department_id")

    if not name or not department_id:
        return error_response("name and department_id are required", 400)

    if not TeacherDepartment.query.filter_by(teacher_id=teacher.id, department_id=department_id).first():
        return error_response("You are not assigned to this department", 403)

    course = create_course(name=name, description=description, department_id=department_id, teacher_id=teacher.id)
    return success_response("Course created successfully", serialize_course(course), 201)


@teacher_bp.get("/my-courses")
@role_required("teacher")
def my_courses():
    """List all courses owned by the current teacher."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    courses = Course.query.filter_by(teacher_id=teacher.id).order_by(Course.created_at.desc()).all()
    return success_response("Courses fetched successfully", {"courses": [serialize_course(c) for c in courses]})


@teacher_bp.put("/course/<int:course_id>")
@role_required("teacher")
@limiter.limit("30/minute")
def update_course(course_id: int):
    """Update course name, description, or department."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    course = Course.query.filter_by(id=course_id, teacher_id=teacher.id).first()
    if not course:
        return error_response("Course not found", 404)

    payload = request.get_json(silent=True) or {}

    if (name := payload.get("name")) is not None:
        name = name.strip()
        if not name:
            return error_response("name cannot be empty", 400)
        course.name = name

    if (description := payload.get("description")) is not None:
        course.description = description.strip()

    if (department_id := payload.get("department_id")) is not None:
        if not TeacherDepartment.query.filter_by(teacher_id=teacher.id, department_id=department_id).first():
            return error_response("You are not assigned to this department", 403)
        course.department_id = department_id

    db.session.commit()
    return success_response("Course updated successfully", serialize_course(course))


@teacher_bp.delete("/course/<int:course_id>")
@role_required("teacher")
@limiter.limit("20/minute")
def delete_course(course_id: int):
    """Delete a course and all associated resources."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    course = Course.query.filter_by(id=course_id, teacher_id=teacher.id).first()
    if not course:
        return error_response("Course not found", 404)

    db.session.delete(course)
    db.session.commit()
    return success_response("Course deleted successfully", {"id": course_id})


# ---------------------------------------------------------------------------
# Resource CRUD
# ---------------------------------------------------------------------------

@teacher_bp.post("/upload-resource")
@role_required("teacher")
@limiter.limit("60/minute")
def upload_resource():
    """Upload a file or add a link resource to a course."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    resource_type = (request.form.get("type") or "").strip().lower()
    title = (request.form.get("title") or "").strip()
    notes = (request.form.get("notes") or "").strip()
    course_id = request.form.get("course_id", type=int)

    if resource_type not in {"file", "link"}:
        return error_response("type must be either 'file' or 'link'", 400)
    if not title or not course_id:
        return error_response("title and course_id are required", 400)

    course = Course.query.filter_by(id=course_id, teacher_id=teacher.id).first()
    if not course:
        return error_response("Course not found or not owned by teacher", 404)

    if not TeacherDepartment.query.filter_by(teacher_id=teacher.id, department_id=course.department_id).first():
        return error_response("You do not have access to this department", 403)

    # --- Link resource ---
    if resource_type == "link":
        url = (request.form.get("url") or "").strip()
        if not is_valid_url(url):
            return error_response("A valid http/https url is required", 400)
        resource = create_resource(course_id=course.id, resource_type="link", title=title, url_or_path=url, notes=notes)
        notify_students_new_upload(teacher, course, resource.id, title)
        db.session.commit()
        return success_response("Link resource added", serialize_resource(resource), 201)

    # --- File resource ---
    file = request.files.get("file")
    if not file or not file.filename:
        return error_response("file is required for type=file", 400)

    if not allowed_file(file.filename, current_app.config["ALLOWED_EXTENSIONS"]):
        return error_response("File type is not allowed", 400)

    safe_name = secure_filename(file.filename)
    file_name = f"{uuid.uuid4().hex}_{safe_name}"
    file.save(os.path.join(current_app.config["UPLOAD_FOLDER"], file_name))

    resource = create_resource(
        course_id=course.id, resource_type="file", title=title,
        url_or_path=f"uploads/{file_name}", notes=notes,
    )
    notify_students_new_upload(teacher, course, resource.id, title)
    db.session.commit()
    return success_response("File uploaded successfully", serialize_resource(resource), 201)


@teacher_bp.put("/resource/<int:resource_id>")
@role_required("teacher")
@limiter.limit("60/minute")
def update_resource(resource_id: int):
    """Edit a resource's title, url (link only), or notes."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    resource = _get_teacher_owned_resource(teacher.id, resource_id)
    if not resource:
        return error_response("Resource not found", 404)

    payload = request.get_json(silent=True) or {}

    if (title := payload.get("title")) is not None:
        title = title.strip()
        if not title:
            return error_response("title cannot be empty", 400)
        resource.title = title

    if (url_or_path := payload.get("url_or_path")) is not None:
        if resource.type != "link":
            return error_response("File resource path cannot be edited", 400)
        if not is_valid_url(url_or_path.strip()):
            return error_response("A valid http/https url is required", 400)
        resource.url_or_path = url_or_path.strip()

    if (notes := payload.get("notes")) is not None:
        resource.notes = notes.strip() or None

    db.session.commit()
    return success_response("Resource updated successfully", serialize_resource(resource))


@teacher_bp.delete("/resource/<int:resource_id>")
@role_required("teacher")
@limiter.limit("60/minute")
def delete_resource(resource_id: int):
    """Delete a resource (and its uploaded file if applicable)."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    resource = _get_teacher_owned_resource(teacher.id, resource_id)
    if not resource:
        return error_response("Resource not found", 404)

    # Remove physical file
    if resource.type == "file" and resource.url_or_path.startswith("uploads/"):
        file_path = os.path.abspath(os.path.join(current_app.root_path, "..", resource.url_or_path))
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass

    db.session.delete(resource)
    db.session.commit()
    return success_response("Resource deleted successfully", {"id": resource_id})


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@teacher_bp.get("/resource/<int:resource_id>/comments")
@role_required("teacher")
def get_resource_comments(resource_id: int):
    """List all comments for a resource."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    resource = _get_teacher_owned_resource(teacher.id, resource_id)
    if not resource:
        return error_response("Resource not found", 404)

    return success_response("Comments fetched", {"comments": serialize_resource_comments(resource)})


@teacher_bp.post("/resource/<int:resource_id>/comments")
@role_required("teacher")
@limiter.limit("60/minute")
def add_resource_comment(resource_id: int):
    """Post a comment or reply on a resource."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    resource = _get_teacher_owned_resource(teacher.id, resource_id)
    if not resource:
        return error_response("Resource not found", 404)

    payload = request.get_json(silent=True) or {}
    content = (payload.get("content") or "").strip()
    parent_id = payload.get("parent_id")

    if not content:
        return error_response("content is required", 400)

    if parent_id is not None:
        parent = ResourceComment.query.filter_by(id=parent_id, resource_id=resource.id).first()
        if not parent:
            return error_response("Parent comment not found", 404)

    comment = ResourceComment(
        resource_id=resource.id,
        user_id=teacher.id,
        parent_id=parent_id if parent_id else None,
        content=content,
    )
    db.session.add(comment)

    # Notify parent comment author on reply
    if parent_id:
        parent = ResourceComment.query.get(parent_id)
        if parent:
            notify_comment_reply(
                replier=teacher, parent_comment_user_id=parent.user_id,
                resource_title=resource.title, course=resource.course,
                resource_id=resource.id, role_prefix=parent.user.role,
            )

    db.session.commit()
    return success_response("Comment added", serialize_comment(comment), 201)


@teacher_bp.delete("/resource/<int:resource_id>/comments/<int:comment_id>")
@role_required("teacher")
@limiter.limit("60/minute")
def delete_resource_comment(resource_id: int, comment_id: int):
    """Delete a comment. Teachers can delete any comment on their resources."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    resource = _get_teacher_owned_resource(teacher.id, resource_id)
    if not resource:
        return error_response("Resource not found", 404)

    comment = ResourceComment.query.filter_by(id=comment_id, resource_id=resource.id).first()
    if not comment:
        return error_response("Comment not found", 404)

    # Soft-delete if has replies, hard-delete if leaf
    has_replies = comment.replies.count() > 0
    if has_replies:
        comment.is_deleted = True
        comment.content = ""
    else:
        parent = comment.parent
        db.session.delete(comment)
        db.session.flush()
        # If parent is soft-deleted and now has zero children, remove it too
        if parent and parent.is_deleted and parent.replies.count() == 0:
            db.session.delete(parent)

    db.session.commit()
    return success_response("Comment deleted", {"id": comment_id})


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

@teacher_bp.get("/notifications")
@role_required("teacher")
def get_notifications():
    """List notifications for the current teacher."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    notifications = (
        Notification.query.filter_by(user_id=teacher.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread_count = Notification.query.filter_by(user_id=teacher.id, is_read=False).count()
    return success_response("Notifications fetched", {
        "notifications": [serialize_notification(n) for n in notifications],
        "unread_count": unread_count,
    })


@teacher_bp.put("/notifications/<int:notification_id>/read")
@role_required("teacher")
def mark_notification_read(notification_id: int):
    """Mark a single notification as read."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    n = Notification.query.filter_by(id=notification_id, user_id=teacher.id).first()
    if not n:
        return error_response("Notification not found", 404)

    n.is_read = True
    db.session.commit()
    return success_response("Notification marked as read", {"id": n.id})


@teacher_bp.put("/notifications/read-all")
@role_required("teacher")
def mark_all_notifications_read():
    """Mark all notifications as read."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    Notification.query.filter_by(user_id=teacher.id, is_read=False).update({"is_read": True})
    db.session.commit()
    return success_response("All notifications marked as read", {})


@teacher_bp.delete("/notifications/<int:notification_id>")
@role_required("teacher")
def delete_notification(notification_id: int):
    """Delete a single notification."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    n = Notification.query.filter_by(id=notification_id, user_id=teacher.id).first()
    if not n:
        return error_response("Notification not found", 404)

    db.session.delete(n)
    db.session.commit()
    return success_response("Notification deleted", {"id": notification_id})


@teacher_bp.delete("/notifications/clear")
@role_required("teacher")
def clear_notifications():
    """Delete all notifications for the current teacher."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    Notification.query.filter_by(user_id=teacher.id).delete()
    db.session.commit()
    return success_response("All notifications cleared", {})


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@teacher_bp.get("/stats")
@role_required("teacher")
def teacher_stats():
    """Return aggregate statistics for the teacher's dashboard."""
    teacher = _get_teacher()
    if not teacher:
        return error_response("Teacher not found", 404)

    department_ids = [d.id for d in teacher.departments.all()]
    if not department_ids:
        return success_response("Teacher stats fetched", {"total_students": 0, "total_courses": 0, "total_files": 0})

    total_students = User.query.filter(User.role == "student", User.department_id.in_(department_ids)).count()
    total_courses = Course.query.filter_by(teacher_id=teacher.id).count()
    total_files = (
        db.session.query(CourseResource)
        .join(Course, Course.id == CourseResource.course_id)
        .filter(Course.teacher_id == teacher.id, CourseResource.type == "file")
        .count()
    )

    return success_response(
        "Teacher stats fetched",
        {"total_students": total_students, "total_courses": total_courses, "total_files": total_files},
    )
