"""Shared serialization helpers for API responses."""

from .models import Course, CourseResource, ResourceComment


def serialize_comment(comment: ResourceComment) -> dict:
    """Serialize a comment with nested replies (recursive)."""
    return {
        "id": comment.id,
        "resource_id": comment.resource_id,
        "user": {
            "id": comment.user.id,
            "name": comment.user.name,
            "role": comment.user.role,
        },
        "parent_id": comment.parent_id,
        "content": comment.content,
        "is_deleted": comment.is_deleted,
        "created_at": comment.created_at.isoformat(),
        "replies": [
            serialize_comment(reply)
            for reply in comment.replies.order_by(ResourceComment.created_at.asc()).all()
        ],
    }


def serialize_resource_comments(resource: CourseResource) -> list[dict]:
    """Return all root-level comments for a resource, newest first."""
    root_comments = (
        resource.comments.filter(ResourceComment.parent_id.is_(None))
        .order_by(ResourceComment.created_at.desc())
        .all()
    )
    return [serialize_comment(c) for c in root_comments]


def serialize_resource(resource: CourseResource) -> dict:
    """Serialize a single resource with its comments."""
    return {
        "id": resource.id,
        "course_id": resource.course_id,
        "type": resource.type,
        "title": resource.title,
        "url_or_path": resource.url_or_path,
        "notes": resource.notes,
        "comments": serialize_resource_comments(resource),
    }


def serialize_resource_brief(resource: CourseResource) -> dict:
    """Serialize a resource without comments (for course listings)."""
    return {
        "id": resource.id,
        "type": resource.type,
        "title": resource.title,
        "url_or_path": resource.url_or_path,
        "notes": resource.notes,
    }


def serialize_course(course: Course) -> dict:
    """Serialize a course with its department, teacher, and resources."""
    return {
        "id": course.id,
        "name": course.name,
        "description": course.description,
        "department": {"id": course.department.id, "name": course.department.name},
        "teacher": {"id": course.teacher.id, "name": course.teacher.name},
        "resources": [
            serialize_resource_brief(r)
            for r in course.resources.order_by("id").all()
        ],
        "created_at": course.created_at.isoformat(),
    }
