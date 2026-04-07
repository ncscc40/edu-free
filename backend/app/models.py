"""SQLAlchemy database models."""

import json
from datetime import datetime

from sqlalchemy import CheckConstraint

from .extensions import bcrypt, db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    uid = db.Column(db.String(80), unique=True, nullable=True)
    email = db.Column(db.String(255), unique=True, nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, index=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'teacher', 'student')", name="ck_users_role"),
    )

    teaching_courses = db.relationship("Course", back_populates="teacher", lazy="dynamic")
    student_department = db.relationship("Department", back_populates="students")

    def set_password(self, password: str):
        self.password_hash = bcrypt.generate_password_hash(password).decode("utf-8")

    def verify_password(self, password: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, password)


class Department(db.Model):
    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False, index=True)

    teachers = db.relationship(
        "User",
        secondary="teacher_departments",
        primaryjoin="Department.id == TeacherDepartment.department_id",
        secondaryjoin="User.id == TeacherDepartment.teacher_id",
        lazy="dynamic",
        backref=db.backref("departments", lazy="dynamic"),
    )
    students = db.relationship("User", back_populates="student_department", lazy="dynamic")
    courses = db.relationship("Course", back_populates="department", lazy="dynamic")


class TeacherDepartment(db.Model):
    __tablename__ = "teacher_departments"

    teacher_id = db.Column(db.Integer, db.ForeignKey("users.id"), primary_key=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), primary_key=True)


class Course(db.Model):
    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(180), nullable=False)
    description = db.Column(db.Text, nullable=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id"), nullable=False, index=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    department = db.relationship("Department", back_populates="courses")
    teacher = db.relationship("User", back_populates="teaching_courses")
    resources = db.relationship(
        "CourseResource", back_populates="course", lazy="dynamic", cascade="all, delete-orphan"
    )


class CourseResource(db.Model):
    __tablename__ = "course_resources"

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True)
    type = db.Column(db.String(10), nullable=False)
    title = db.Column(db.String(180), nullable=False)
    url_or_path = db.Column(db.String(512), nullable=False)
    notes = db.Column(db.Text, nullable=True)

    __table_args__ = (
        CheckConstraint("type IN ('file', 'link')", name="ck_course_resources_type"),
    )

    course = db.relationship("Course", back_populates="resources")
    comments = db.relationship(
        "ResourceComment", back_populates="resource", lazy="dynamic", cascade="all, delete-orphan"
    )


class ResourceComment(db.Model):
    __tablename__ = "resource_comments"

    id = db.Column(db.Integer, primary_key=True)
    resource_id = db.Column(db.Integer, db.ForeignKey("course_resources.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    parent_id = db.Column(db.Integer, db.ForeignKey("resource_comments.id"), nullable=True, index=True)
    content = db.Column(db.Text, nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    resource = db.relationship("CourseResource", back_populates="comments")
    user = db.relationship("User")
    parent = db.relationship("ResourceComment", remote_side=[id], backref=db.backref("replies", lazy="dynamic"))


class Notification(db.Model):
    """In-app notifications for teachers and students."""

    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    type = db.Column(db.String(20), nullable=False)  # comment, reply, upload
    message = db.Column(db.String(512), nullable=False)
    link = db.Column(db.String(512), nullable=False)  # frontend route to navigate to
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=True)
    resource_id = db.Column(db.Integer, db.ForeignKey("course_resources.id"), nullable=True)
    is_read = db.Column(db.Boolean, default=False, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("type IN ('comment', 'reply', 'upload')", name="ck_notifications_type"),
    )

    user = db.relationship("User", backref=db.backref("notifications", lazy="dynamic"))


# ───────────────────────────────────────────────────────────────────────────
# AI-generated content  (persisted for future use)
# ───────────────────────────────────────────────────────────────────────────


class AIAnalysis(db.Model):
    """Stores AI-generated summaries / key-points for a resource."""

    __tablename__ = "ai_analyses"

    id = db.Column(db.Integer, primary_key=True)
    resource_id = db.Column(
        db.Integer, db.ForeignKey("course_resources.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    analysis_type = db.Column(db.String(20), nullable=False)  # video, document
    source = db.Column(db.String(30), nullable=True)          # transcription, full_text, title_context
    summary = db.Column(db.Text, nullable=True)
    data_json = db.Column(db.Text, nullable=False, default="{}")  # full structured result
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("analysis_type IN ('video', 'document')", name="ck_ai_analyses_type"),
    )

    resource = db.relationship("CourseResource", backref=db.backref("ai_analyses", lazy="dynamic", cascade="all, delete-orphan"))
    user = db.relationship("User")

    # --- helpers ----------------------------------------------------------

    @property
    def data(self) -> dict:
        try:
            return json.loads(self.data_json)
        except (json.JSONDecodeError, TypeError):
            return {}

    @data.setter
    def data(self, value: dict):
        self.data_json = json.dumps(value, ensure_ascii=False)

    def to_dict(self) -> dict:
        d = self.data
        d["id"] = self.id
        d["resource_id"] = self.resource_id
        d["analysis_type"] = self.analysis_type
        d["source"] = self.source
        # Use data_json summary (full structured) preferring over the plain-text column
        if not d.get("summary") and self.summary:
            d["summary"] = self.summary
        d["created_at"] = self.created_at.isoformat()
        d["updated_at"] = self.updated_at.isoformat()
        return d


class AIFlashcard(db.Model):
    """AI-generated flashcard tied to a resource + student."""

    __tablename__ = "ai_flashcards"

    id = db.Column(db.Integer, primary_key=True)
    resource_id = db.Column(
        db.Integer, db.ForeignKey("course_resources.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    front = db.Column(db.Text, nullable=False)
    back = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), nullable=True, default="General")
    difficulty = db.Column(db.String(10), nullable=True)  # easy, medium, hard
    order = db.Column(db.Integer, default=0, nullable=False)
    times_reviewed = db.Column(db.Integer, default=0, nullable=False)
    last_reviewed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    resource = db.relationship("CourseResource", backref=db.backref("ai_flashcards", lazy="dynamic", cascade="all, delete-orphan"))
    user = db.relationship("User")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "resource_id": self.resource_id,
            "front": self.front,
            "back": self.back,
            "category": self.category,
            "difficulty": self.difficulty,
            "order": self.order,
            "times_reviewed": self.times_reviewed,
            "last_reviewed_at": self.last_reviewed_at.isoformat() if self.last_reviewed_at else None,
            "created_at": self.created_at.isoformat(),
        }


class AIChatHistory(db.Model):
    """Persists chat sessions per student (general or course-specific)."""

    __tablename__ = "ai_chat_history"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    course_id = db.Column(
        db.Integer, db.ForeignKey("courses.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    title = db.Column(db.String(255), nullable=True)
    messages_json = db.Column(db.Text, nullable=False, default="[]")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = db.relationship("User")
    course = db.relationship("Course")

    @property
    def messages(self) -> list:
        try:
            return json.loads(self.messages_json)
        except (json.JSONDecodeError, TypeError):
            return []

    @messages.setter
    def messages(self, value: list):
        self.messages_json = json.dumps(value, ensure_ascii=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "course_id": self.course_id,
            "title": self.title,
            "messages": self.messages,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
