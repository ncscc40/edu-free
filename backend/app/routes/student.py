"""Student routes -- course browsing and resource comments."""

from flask import Blueprint, request
from flask_jwt_extended import get_jwt, get_jwt_identity

from ..extensions import db, limiter
from ..models import Course, CourseResource, Notification, ResourceComment, User
from ..serializers import serialize_comment, serialize_resource_brief, serialize_resource_comments
from ..services.notification_service import (
    notify_comment_reply,
    notify_teacher_student_comment,
    serialize_notification,
)
from ..utils.decorators import role_required
from ..utils.responses import error_response, success_response


student_bp = Blueprint("student", __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_student() -> User | None:
    """Return the current authenticated student or None."""
    user = User.query.get(int(get_jwt_identity()))
    return user if user and user.role == "student" else None


def _get_student_authorized_resource(student: User, resource_id: int) -> CourseResource | None:
    """Return a resource only if it belongs to the student's department."""
    return (
        db.session.query(CourseResource)
        .join(Course, Course.id == CourseResource.course_id)
        .filter(CourseResource.id == resource_id, Course.department_id == student.department_id)
        .first()
    )


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------

@student_bp.get("/courses")
@role_required("student")
def student_courses():
    """List all courses in the student's department."""
    claims = get_jwt()
    department_id = claims.get("department_id")
    if not department_id:
        return error_response("Student department not found", 400)

    courses = Course.query.filter_by(department_id=department_id).order_by(Course.created_at.desc()).all()
    data = [
        {
            "id": course.id,
            "name": course.name,
            "description": course.description,
            "teacher": {"id": course.teacher.id, "name": course.teacher.name},
            "resources": [serialize_resource_brief(r) for r in course.resources.all()],
            "created_at": course.created_at.isoformat(),
        }
        for course in courses
    ]

    return success_response("Courses fetched successfully", {"courses": data})


@student_bp.get("/course/<int:course_id>")
@role_required("student")
def student_course_detail(course_id: int):
    """Get full course details including resources and comments."""
    claims = get_jwt()
    department_id = claims.get("department_id")

    course = Course.query.get(course_id)
    if not course:
        return error_response("Course not found", 404)
    if course.department_id != department_id:
        return error_response("You are not authorized to access this course", 403)

    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    details = {
        "id": course.id,
        "name": course.name,
        "description": course.description,
        "department_id": course.department_id,
        "teacher": {"id": course.teacher.id, "name": course.teacher.name},
        "resources": [
            {
                **serialize_resource_brief(r),
                "comments": serialize_resource_comments(r),
            }
            for r in course.resources.order_by("id").all()
        ],
        "created_at": course.created_at.isoformat(),
    }

    return success_response("Course details fetched successfully", details)


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

@student_bp.get("/resource/<int:resource_id>/comments")
@role_required("student")
def student_resource_comments(resource_id: int):
    """List all comments for a resource."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    resource = _get_student_authorized_resource(student, resource_id)
    if not resource:
        return error_response("Resource not found", 404)

    return success_response("Comments fetched", {"comments": serialize_resource_comments(resource)})


@student_bp.post("/resource/<int:resource_id>/comments")
@role_required("student")
@limiter.limit("80/minute")
def student_add_resource_comment(resource_id: int):
    """Post a comment or reply on a resource."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    resource = _get_student_authorized_resource(student, resource_id)
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
        user_id=student.id,
        parent_id=parent_id if parent_id else None,
        content=content,
    )
    db.session.add(comment)

    # Notify the teacher that a student commented on their resource
    course = resource.course
    notify_teacher_student_comment(student, course, resource.id, resource.title)

    # Notify parent comment author on reply
    if parent_id:
        parent = ResourceComment.query.get(parent_id)
        if parent:
            notify_comment_reply(
                replier=student, parent_comment_user_id=parent.user_id,
                resource_title=resource.title, course=course,
                resource_id=resource.id, role_prefix=parent.user.role,
            )

    db.session.commit()
    return success_response("Comment added", serialize_comment(comment), 201)


@student_bp.delete("/resource/<int:resource_id>/comments/<int:comment_id>")
@role_required("student")
@limiter.limit("60/minute")
def student_delete_resource_comment(resource_id: int, comment_id: int):
    """Delete a comment. Students can only delete their own comments."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    resource = _get_student_authorized_resource(student, resource_id)
    if not resource:
        return error_response("Resource not found", 404)

    comment = ResourceComment.query.filter_by(id=comment_id, resource_id=resource.id).first()
    if not comment:
        return error_response("Comment not found", 404)

    if comment.user_id != student.id:
        return error_response("You can only delete your own comments", 403)

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

@student_bp.get("/notifications")
@role_required("student")
def get_student_notifications():
    """List notifications for the current student."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    notifications = (
        Notification.query.filter_by(user_id=student.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    unread_count = Notification.query.filter_by(user_id=student.id, is_read=False).count()
    return success_response("Notifications fetched", {
        "notifications": [serialize_notification(n) for n in notifications],
        "unread_count": unread_count,
    })


@student_bp.put("/notifications/<int:notification_id>/read")
@role_required("student")
def mark_student_notification_read(notification_id: int):
    """Mark a single notification as read."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    n = Notification.query.filter_by(id=notification_id, user_id=student.id).first()
    if not n:
        return error_response("Notification not found", 404)

    n.is_read = True
    db.session.commit()
    return success_response("Notification marked as read", {"id": n.id})


@student_bp.put("/notifications/read-all")
@role_required("student")
def mark_all_student_notifications_read():
    """Mark all notifications as read."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    Notification.query.filter_by(user_id=student.id, is_read=False).update({"is_read": True})
    db.session.commit()
    return success_response("All notifications marked as read", {})


@student_bp.delete("/notifications/<int:notification_id>")
@role_required("student")
def delete_student_notification(notification_id: int):
    """Delete a single notification."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    n = Notification.query.filter_by(id=notification_id, user_id=student.id).first()
    if not n:
        return error_response("Notification not found", 404)

    db.session.delete(n)
    db.session.commit()
    return success_response("Notification deleted", {"id": notification_id})


@student_bp.delete("/notifications/clear")
@role_required("student")
def clear_student_notifications():
    """Delete all notifications for the current student."""
    student = _get_student()
    if not student:
        return error_response("Student not found", 404)

    Notification.query.filter_by(user_id=student.id).delete()
    db.session.commit()
    return success_response("All notifications cleared", {})
