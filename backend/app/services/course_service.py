"""Course service — course and resource creation."""

from ..extensions import db
from ..models import Course, CourseResource


def create_course(name: str, description: str, department_id: int, teacher_id: int):
    course = Course(
        name=name,
        description=description,
        department_id=department_id,
        teacher_id=teacher_id,
    )
    db.session.add(course)
    db.session.commit()
    return course


def create_resource(course_id: int, resource_type: str, title: str, url_or_path: str, notes: str = ""):
    resource = CourseResource(
        course_id=course_id,
        type=resource_type,
        title=title,
        url_or_path=url_or_path,
        notes=(notes or "").strip() or None,
    )
    db.session.add(resource)
    db.session.commit()
    return resource
