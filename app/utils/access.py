from flask_login import current_user

from app.models import Department


def is_global_admin():
    return current_user.admin_role in ["super_admin", "admin"]


def is_tl_user():
    return current_user.admin_role in ["head_tl", "tl"]


def get_accessible_department_ids():
    if is_global_admin():
        return None

    if not current_user.department_id:
        return []

    root_id = current_user.department_id
    ids = {root_id}
    queue = [root_id]

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
    return is_global_admin()