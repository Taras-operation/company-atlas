from flask import Blueprint, render_template, url_for
from flask_login import current_user, login_required
from sqlalchemy import or_

from app.models import (
    AuditLog,
    Department,
    DepartmentRelation,
    Person,
    VisibilityChangeRequest,
)
from app.utils.access import get_accessible_department_ids, is_global_admin


dashboard_bp = Blueprint("dashboard", __name__)


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
        "display_time": log.created_at.strftime("%d.%m %H:%M"),
        "url": _entity_url(log),
    }


@dashboard_bp.route("/")
@login_required
def index():
    accessible_ids = get_accessible_department_ids()

    # ===== SUPER ADMIN / ADMIN =====
    if is_global_admin():
        stats = {
            "departments": Department.query.filter_by(is_archived=False).count(),
            "people": Person.query.filter_by(is_archived=False).count(),
            "pending_requests": VisibilityChangeRequest.query.filter_by(status="pending").count(),
            "relations": DepartmentRelation.query.filter_by(is_archived=False).count(),
        }

        recent_logs = (
            AuditLog.query
            .order_by(AuditLog.created_at.desc())
            .limit(12)
            .all()
        )

        activity_items = [_format_activity_item(log) for log in recent_logs]

        return render_template(
            "dashboard/index.html",
            stats=stats,
            recent_logs=recent_logs,
            activity_items=activity_items,
            is_tl_dashboard=False,
        )

    # ===== TL DASHBOARD =====
    departments_query = Department.query.filter_by(is_archived=False)
    people_query = Person.query.filter_by(is_archived=False)
    relations_query = DepartmentRelation.query.filter_by(is_archived=False)

    if accessible_ids:
        departments_query = departments_query.filter(
            Department.id.in_(accessible_ids)
        )

        people_query = people_query.filter(
            Person.department_id.in_(accessible_ids)
        )

        relations_query = relations_query.filter(
            or_(
                DepartmentRelation.department_from_id.in_(accessible_ids),
                DepartmentRelation.department_to_id.in_(accessible_ids),
            )
        )

    stats = {
        "departments": departments_query.count(),
        "people": people_query.count(),
        "roles": 0,
        "relations": relations_query.count(),
    }

    departments = (
        departments_query
        .order_by(Department.name.asc())
        .all()
    )

    people = (
        people_query
        .order_by(Person.full_name.asc())
        .limit(8)
        .all()
    )

    relations = (
        relations_query
        .order_by(DepartmentRelation.created_at.desc())
        .limit(8)
        .all()
    )

    return render_template(
        "dashboard/index.html",
        stats=stats,
        departments=departments,
        people=people,
        relations=relations,
        recent_logs=[],
        activity_items=[],
        is_tl_dashboard=True,
    )