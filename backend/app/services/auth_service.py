"""Authentication service — user creation and lookup."""

from sqlalchemy import or_

from ..extensions import db
from ..models import Department, User


def create_student(name: str, uid: str, password: str, department_id: int) -> User:
    student = User(name=name, uid=uid, role="student", department_id=department_id)
    student.set_password(password)
    db.session.add(student)
    db.session.commit()
    return student


def find_user_by_identifier(identifier: str):
    return User.query.filter(or_(User.uid == identifier, User.email == identifier)).first()


def department_exists(department_id: int) -> bool:
    return Department.query.get(department_id) is not None
