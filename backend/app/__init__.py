"""Flask application factory."""

from pathlib import Path

from flask import Flask, send_from_directory
from dotenv import load_dotenv
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError

from .config import Config
from .extensions import bcrypt, cors, db, jwt, limiter, migrate
from .routes.admin import admin_bp
from .routes.ai import ai_bp
from .routes.auth import auth_bp
from .routes.student import student_bp
from .routes.teacher import teacher_bp
from .utils.responses import error_response


def create_app(config_class=Config):
    """Create and configure the Flask application."""
    load_dotenv()
    app = Flask(__name__)
    app.config.from_object(config_class)

    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    bcrypt.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    )
    limiter.init_app(app)

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(teacher_bp, url_prefix="/api/teacher")
    app.register_blueprint(student_bp, url_prefix="/api/student")
    app.register_blueprint(ai_bp, url_prefix="/api/ai")

    @app.get("/uploads/<path:filename>")
    def serve_upload(filename):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    @jwt.unauthorized_loader
    def missing_token(_reason):
        return error_response("Missing or invalid JWT", 401)

    @jwt.invalid_token_loader
    def invalid_token(_reason):
        return error_response("Invalid JWT token", 401)

    @jwt.expired_token_loader
    def expired_token(_jwt_header, _jwt_payload):
        return error_response("JWT token has expired", 401)

    @app.teardown_request
    def teardown_request(_error):
        if _error is not None:
            db.session.rollback()

    @app.errorhandler(IntegrityError)
    def handle_integrity_error(_error):
        db.session.rollback()
        return error_response("Database integrity error", 409)

    @app.errorhandler(OperationalError)
    def handle_operational_error(_error):
        db.session.rollback()
        return error_response("Database operation failed. Please try again.", 503)

    @app.errorhandler(SQLAlchemyError)
    def handle_sqlalchemy_error(_error):
        db.session.rollback()
        return error_response("Database request failed", 500)

    @app.errorhandler(400)
    def handle_bad_request(_error):
        return error_response("Bad request", 400)

    @app.errorhandler(401)
    def handle_unauthorized(_error):
        return error_response("Unauthorized", 401)

    @app.errorhandler(403)
    def handle_forbidden(_error):
        return error_response("Forbidden", 403)

    @app.errorhandler(404)
    def handle_not_found(_error):
        return error_response("Resource not found", 404)

    @app.errorhandler(413)
    def handle_payload_too_large(_error):
        return error_response("Uploaded file exceeds allowed size", 413)

    @app.errorhandler(429)
    def handle_rate_limit(_error):
        return error_response("Too many requests", 429)

    @app.errorhandler(500)
    def handle_internal(_error):
        db.session.rollback()
        return error_response("Internal server error", 500)

    return app
