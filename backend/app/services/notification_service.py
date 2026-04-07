"""Notification creation helpers."""

from ..extensions import db
from ..models import Course, Notification, User


def _create(user_id: int, ntype: str, message: str, link: str,
            course_id: int | None = None, resource_id: int | None = None) -> Notification:
    """Insert a single notification row and return it (caller must commit)."""
    n = Notification(
        user_id=user_id, type=ntype, message=message, link=link,
        course_id=course_id, resource_id=resource_id,
    )
    db.session.add(n)
    return n


def notify_teacher_new_comment(
    commenter: User, course: Course, resource_id: int, resource_title: str
):
    """Notify the course teacher that a student commented on a resource."""
    if commenter.id == course.teacher_id:
        return  # don't notify yourself
    _create(
        user_id=course.teacher_id,
        ntype="comment",
        message=f"{commenter.name} commented on \"{resource_title}\"",
        link=f"/teacher/my-courses?highlight=resource-{resource_id}",
        course_id=course.id,
        resource_id=resource_id,
    )


def notify_comment_reply(
    replier: User, parent_comment_user_id: int,
    resource_title: str, course: Course, resource_id: int, role_prefix: str,
):
    """Notify the parent comment author about a reply."""
    if replier.id == parent_comment_user_id:
        return  # don't notify yourself
    link = (
        f"/{role_prefix}/my-courses?highlight=resource-{resource_id}"
        if role_prefix == "teacher"
        else f"/{role_prefix}/courses/{course.id}?highlight=resource-{resource_id}"
    )
    _create(
        user_id=parent_comment_user_id,
        ntype="reply",
        message=f"{replier.name} replied to your comment on \"{resource_title}\"",
        link=link,
        course_id=course.id,
        resource_id=resource_id,
    )


def notify_students_new_upload(
    teacher: User, course: Course, resource_id: int, resource_title: str,
):
    """Notify all students in the course department about a new upload."""
    students = User.query.filter_by(role="student", department_id=course.department_id).all()
    for student in students:
        _create(
            user_id=student.id,
            ntype="upload",
            message=f"{teacher.name} uploaded \"{resource_title}\" in {course.name}",
            link=f"/student/courses/{course.id}?highlight=resource-{resource_id}",
            course_id=course.id,
            resource_id=resource_id,
        )


def notify_teacher_student_comment(
    student: User, course: Course, resource_id: int, resource_title: str,
):
    """Notify the teacher when a student comments on their course resource."""
    _create(
        user_id=course.teacher_id,
        ntype="comment",
        message=f"{student.name} commented on \"{resource_title}\" in {course.name}",
        link=f"/teacher/my-courses?highlight=resource-{resource_id}",
        course_id=course.id,
        resource_id=resource_id,
    )


def serialize_notification(n: Notification) -> dict:
    """Serialize a Notification for JSON response."""
    return {
        "id": n.id,
        "type": n.type,
        "message": n.message,
        "link": n.link,
        "course_id": n.course_id,
        "resource_id": n.resource_id,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat(),
    }
