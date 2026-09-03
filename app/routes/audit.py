from flask import Blueprint, flash, redirect, render_template, url_for
from flask_login import current_user, login_required

from app.models import AuditLog, Department, DepartmentType, Person, RelationType


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


FIELD_LABELS = {
    "name": "Назва",
    "full_name": "Ім'я",
    "username": "Логін",
    "position": "Посада",
    "size_label": "Розмір",
    "description": "Опис",
    "short_description": "Короткий опис",
    "full_description": "Повний опис",
    "functions": "Функції",
    "color": "Колір",
    "color_mode": "Режим кольору",
    "admin_role": "Роль",
    "grade": "Грейд",
    "strength": "Сила зв'язку",
    "direction": "Напрям",
    "is_bidirectional": "Двосторонній",
    "department_type_id": "Тип відділу",
    "parent_department_id": "Головний відділ",
    "department_id": "Відділ",
    "manager_id": "Керівник",
    "department_from_id": "Відділ (з)",
    "department_to_id": "Відділ (до)",
    "relation_type_id": "Тип зв'язку",
    "person_id": "Людина",
    "email": "Email",
    "telegram": "Telegram",
    "phone": "Телефон",
    "chat_link": "Чат",
    "notes": "Нотатки",
    "responsibility_area": "Зона відповідальності",
}

_DEPT_KEYS = {"parent_department_id", "department_id", "department_from_id", "department_to_id"}
_PERSON_KEYS = {"manager_id", "person_id"}


def _resolve_value(key, value):
    """Turn a stored raw value (often an id) into something readable."""
    if value is None or value == "":
        return "—"
    if key == "department_type_id":
        item = DepartmentType.query.get(value)
        return item.name if item else f"#{value}"
    if key == "relation_type_id":
        item = RelationType.query.get(value)
        return item.name if item else f"#{value}"
    if key in _DEPT_KEYS:
        return _department_name(value) or f"#{value}"
    if key in _PERSON_KEYS:
        return _person_name(value) or f"#{value}"
    if isinstance(value, bool):
        return "Так" if value else "Ні"
    return value


def _format_changes(log):
    """Field-by-field before → after for the log's card. On update, unchanged fields
    are dropped; on create/delete only the side that exists is shown."""
    old = log.old_data or {}
    new = log.new_data or {}
    keys = list(dict.fromkeys(list(old.keys()) + list(new.keys())))
    rows = []
    for k in keys:
        has_old, has_new = k in old, k in new
        ov, nv = old.get(k), new.get(k)
        if log.action == "update" and has_old and has_new and ov == nv:
            continue
        rows.append({
            "label": FIELD_LABELS.get(k, k),
            "old": _resolve_value(k, ov) if has_old else None,
            "new": _resolve_value(k, nv) if has_new else None,
            "has_old": has_old,
            "has_new": has_new,
        })
    return rows


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
    from app.models import AdminUser
    from app.utils.access import get_accessible_department_ids, is_global_admin

    query = AuditLog.query

    if not is_global_admin():
        # Scoped roles (head_tl / tl / operation) see the audit trail for their own
        # department subtree: actions performed by any admin attached to that subtree
        # (e.g. an Operation user working on the department) — so a TL/Head can see
        # everything Operation does in their department.
        accessible = get_accessible_department_ids()
        if not accessible:
            flash("Немає доступу", "danger")
            return redirect(url_for("dashboard.index"))

        actor_ids = {
            row.id
            for row in AdminUser.query
            .filter(AdminUser.department_id.in_(accessible))
            .all()
        }
        actor_ids.add(current_user.id)
        query = query.filter(AuditLog.user_id.in_(actor_ids))

    items = (
        query
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


def _accessible_actor_ids():
    """Actor ids a scoped viewer may see (their department subtree). None = all."""
    from app.models import AdminUser
    from app.utils.access import get_accessible_department_ids, is_global_admin

    if is_global_admin():
        return None
    accessible = get_accessible_department_ids()
    if not accessible:
        return set()
    ids = {row.id for row in AdminUser.query.filter(AdminUser.department_id.in_(accessible)).all()}
    ids.add(current_user.id)
    return ids


@audit_bp.route("/<int:log_id>")
@login_required
def detail_audit(log_id):
    log = AuditLog.query.get_or_404(log_id)

    actor_ids = _accessible_actor_ids()
    if actor_ids is not None and log.user_id not in actor_ids:
        flash("Немає доступу до цього запису", "danger")
        return redirect(url_for("audit.list_audit"))

    return render_template(
        "audit/detail.html",
        item=_format_activity_item(log),
        log=log,
        changes=_format_changes(log),
        entity_url=_entity_url(log),
    )
