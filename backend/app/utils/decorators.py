"""Route decorators for authorization."""

from functools import wraps

from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from ..models import User
from .responses import error_response


def role_required(*allowed_roles):
    def wrapper(fn):
        @wraps(fn)
        def decorated(*args, **kwargs):
            verify_jwt_in_request()
            claims = get_jwt()
            role = claims.get("role")
            if role not in allowed_roles:
                return error_response("You do not have permission to access this resource", 403)

            user_id = get_jwt_identity()
            user = User.query.get(int(user_id)) if user_id else None
            if not user:
                return error_response("Invalid token subject", 401)

            return fn(*args, **kwargs)

        return decorated

    return wrapper
