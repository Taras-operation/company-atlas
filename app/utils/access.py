from flask_login import current_user

from app.models import Department


def is_global_admin():
    return current_user.admin_role in ["super_admin", "admin"]


def is_tl_user():
    return current_user.admin_role in ["head_tl", "tl", "operation"]


def _scope_root_ids(user):
    """Root departments a scoped user is attached to (primary + extra)."""
    getter = getattr(user, "scoped_department_ids", None)
    if getter is not None:
        return set(getter)
    # Fallback for user objects without the relationship loaded.
    return {user.department_id} if getattr(user, "department_id", None) else set()


def get_accessible_department_ids():
    if is_global_admin():
        return None

    roots = _scope_root_ids(current_user)
    if not roots:
        return []

    ids = set(roots)
    queue = list(roots)

    while queue:
        parent_id = queue.pop(0)

        children = Department.query.filter_by(
            parent_department_id=parent_id,
            is_archived=False,
        ).all()

        for child in children:
            if child.id not in ids:
                ids.add(child.id)
                queue.append(child.id)

    return list(ids)


def can_access_department(department_id):
    accessible_ids = get_accessible_department_ids()

    if accessible_ids is None:
        return True

    return department_id in accessible_ids


def can_manage_settings():
    return is_global_admin()


def can_approve_visibility_requests():
    return is_global_admin()


def can_view_audit():
    # Global admins see everything; scoped roles (head_tl / tl / operation) see the
    # audit trail for their own department subtree(s).
    return is_global_admin() or bool(_scope_root_ids(current_user))