from flask import Blueprint, flash, redirect, render_template, url_for
from flask_login import current_user, login_required

from app.models import AuditLog, Department, Person


audit_bp = Blueprint("audit", __name__, url_prefix="/audit")


ACTION_META = {
    "create": {
        "label": "Створено",
        "badge": "badge-create",
        "icon": "+",
    },
    "update": {
        "label": "Оновлено",
        "badge": "badge-update",
        "icon": "↻",
    },
    "archive": {
        "label": "Архівовано",
        "badge": "badge-archive",
        "icon": "−",
    },
    "restore": {
        "label": "Відновлено",
        "badge": "badge-restore",
        "icon": "↩",
    },
    "approve": {
        "label": "Підтверджено",
        "badge": "badge-approve",
        "icon": "✓",
    },
    "reject": {
        "label": "Відхилено",
        "badge": "badge-reject",
        "icon": "×",
    },
}

ENTITY_LABELS = {
    "person": "людину",
    "department": "відділ",
    "relation": "зв’язок",
    "visibility_request": "запит доступу",
}


def _value_from_log(log, key, default="—"):
    if log.new_data and key in log.new_data:
        return log.new_data.get(key) or default

    if log.old_data and key in log.old_data:
        return log.old_data.get(key) or default

    return default


def _department_name(department_id):
    department = Department.query.get(department_id) if department_id else None
    return department.name if department else None


def _person_name(person_id):
    person = Person.query.get(person_id) if person_id else None
    return person.full_name if person else None


def _relation_name(log):
    department_from_id = _value_from_log(log, "department_from_id", None)
    department_to_id = _value_from_log(log, "department_to_id", None)

    department_from = _department_name(department_from_id)
    department_to = _department_name(department_to_id)

    if department_from and department_to:
        return f"{department_from} → {department_to}"

    return f"Зв’язок #{log.entity_id}"


def _entity_name(log):
    if log.entity_type == "person":
        return _value_from_log(log, "full_name", f"Людина #{log.entity_id}")

    if log.entity_type == "department":
        return _value_from_log(log, "name", f"Відділ #{log.entity_id}")

    if log.entity_type == "relation":
        return _relation_name(log)

    if log.entity_type == "visibility_request":
        person_id = _value_from_log(log, "person_id", None)
        person_name = _person_name(person_id)
        return person_name or f"Запит #{log.entity_id}"

    return f"{log.entity_type} #{log.entity_id}"


def _entity_url(log):
    if log.entity_type == "person":
        return url_for("people.detail_person", person_id=log.entity_id)

    if log.entity_type == "department":
        return url_for("departments.detail_department", department_id=log.entity_id)

    if log.entity_type == "relation":
        return url_for("relations.edit_relation", relation_id=log.entity_id)

    if log.entity_type == "visibility_request":
        return url_for("roles.list_roles")

    return None


def _format_activity_item(log):
    action_meta = ACTION_META.get(
        log.action,
        {
            "label": log.action,
            "badge": "badge-default",
            "icon": "•",
        },
    )

    entity_label = ENTITY_LABELS.get(log.entity_type, log.entity_type)
    entity_name = _entity_name(log)
    actor = log.user.username if log.user else "System"

    return {
        "id": log.id,
        "actor": actor,
        "action": log.action,
        "action_label": action_meta["label"],
        "badge": action_meta["badge"],
        "icon": action_meta["icon"],
        "entity_type": log.entity_type,
        "entity_label": entity_label,
        "entity_name": entity_name,
        "created_at": log.created_at,
        "display_time": log.created_at.strftime("%d.%m.%Y %H:%M"),
        "url": _entity_url(log),
    }


@audit_bp.route("")
@login_required
def list_audit():
    if current_user.admin_role not in ["super_admin", "admin"]:
        flash("Немає доступу", "danger")
        return redirect(url_for("dashboard.index"))

    items = (
        AuditLog.query
        .order_by(AuditLog.created_at.desc())
        .limit(200)
        .all()
    )

    activity_items = [_format_activity_item(item) for item in items]

    return render_template(
        "audit/list.html",
        items=items,
        activity_items=activity_items,
    )
