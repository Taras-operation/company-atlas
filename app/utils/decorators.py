from functools import wraps

from flask import abort
from flask_login import current_user, login_required


def role_required(*allowed_roles):
    def decorator(func):
        @wraps(func)
        @login_required
        def wrapper(*args, **kwargs):
            if current_user.admin_role in ["super_admin", "developer"]:
                return func(*args, **kwargs)

            if current_user.admin_role not in allowed_roles:
                abort(403)

            return func(*args, **kwargs)

        return wrapper

    return decorator