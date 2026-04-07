import os
import sys

# Ensure the backend directory is on the Python path so imports work
# regardless of which directory the user runs this from.
_backend_dir = os.path.dirname(os.path.abspath(__file__))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)
os.chdir(_backend_dir)

from app import create_app
from app.extensions import db
from app.models import Course, CourseResource, Department, Notification, TeacherDepartment, User


app = create_app()


@app.shell_context_processor
def shell_context():
    return {
        "db": db,
        "User": User,
        "Department": Department,
        "TeacherDepartment": TeacherDepartment,
        "Course": Course,
        "CourseResource": CourseResource,
    }


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
