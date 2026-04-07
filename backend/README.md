# College Backend (Flask)

Production-ready Flask backend using application factory pattern, JWT auth, RBAC, SQLAlchemy, migrations, and secure uploads.

## Features

- Roles: `admin`, `teacher`, `student`
- JWT access + refresh tokens
- RBAC route protection via `@role_required(...)`
- SQLite default database (env-overridable)
- Flask-Migrate support
- Secure password hashing with Flask-Bcrypt
- CORS for Next.js frontend
- Consistent API response format
- Rate limiting with Flask-Limiter
- File upload with extension whitelist and max payload size

## Project Structure

```text
backend/
├── app/
│   ├── __init__.py
│   ├── config.py
│   ├── extensions.py
│   ├── models.py
│   ├── routes/
│   │   ├── auth.py
│   │   ├── admin.py
│   │   ├── teacher.py
│   │   └── student.py
│   ├── services/
│   └── utils/
├── uploads/
├── migrations/
├── run.py
├── requirements.txt
└── .env.example
```

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

## Migrations

```bash
flask db init
flask db migrate -m "initial"
flask db upgrade
```

## Run

```bash
flask --app run.py run
```

## Seed First Admin

Use Flask shell:

```bash
flask --app run.py shell
```

```python
from app.extensions import db
from app.models import User
admin = User(name="System Admin", email="admin@college.com", role="admin")
admin.set_password("Admin@12345")
db.session.add(admin)
db.session.commit()
```

## API Endpoints

### Auth
- `POST /api/auth/create-admin`
- `POST /api/auth/register-student`
- `POST /api/auth/login`
- `POST /api/auth/refresh`

### Admin
- `POST /api/admin/create-teacher`
- `POST /api/admin/create-department`
- `POST /api/admin/assign-department`
- `GET /api/admin/teachers`
- `GET /api/admin/departments`

### Teacher
- `POST /api/teacher/create-course`
- `POST /api/teacher/upload-resource`
- `GET /api/teacher/my-departments`
- `GET /api/teacher/stats`

### Student
- `GET /api/student/courses`
- `GET /api/student/course/<id>`

## Response Format

```json
{
  "success": true,
  "message": "...",
  "data": {}
}
```