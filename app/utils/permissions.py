from flask_login import current_user


def can_manage_admin_users() -> bool:
    return getattr(current_user, "admin_role", None) == "super_admin"
