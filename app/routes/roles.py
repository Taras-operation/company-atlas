from datetime import datetime

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required

from app.extensions import db
from app.models import (
    Person,
    PersonVisibilityBrand,
    PersonVisibilityDepartment,
    PersonVisibilityGeo,
    VisibilityChangeRequest,
)
from app.utils.audit import log_action
from app.utils.access import get_accessible_department_ids, is_global_admin


roles_bp = Blueprint("roles", __name__, url_prefix="/roles")


# Helper function to format visibility request changes for compact display
VISIBILITY_FIELD_LABELS = {
    "map_access": "Карта",
    "map_show_connections": "Зв’язки",
    "brand_scope": "Бренди",
    "geo_scope": "GEO",
    "department_scope": "Відділи",
    "card_show_short_description": "Короткий опис",
    "card_show_full_description": "Повний опис",
    "card_show_relations": "Зв’язки відділу",
    "show_department_people_count": "Кількість людей",
    "show_department_leads": "Керівники / TL",
    "show_department_lead_positions": "Посади керівників",
    "show_department_people": "Люди відділу",
    "show_department_people_positions": "Посади людей",
    "show_department_people_responsibility": "Зони відповідальності",
    "show_department_email": "Email відділу",
    "show_department_telegram": "Telegram відділу",
    "show_department_chat_link": "Chat link",
    "show_lead_contacts": "Контакти керівників",
    "show_lead_email": "Email керівників",
    "show_lead_telegram": "Telegram керівників",
    "show_lead_reddy": "Reddy керівників",
    "show_people_contacts": "Контакти людей",
    "show_people_email": "Email людей",
    "show_people_telegram": "Telegram людей",
    "show_people_reddy": "Reddy людей",
}

ACCESS_LEVEL_LABELS = {
    "none": "Закритий доступ",
    "limited": "Частковий доступ",
    "full": "Повний доступ",
}

GRADE_LABELS = {
    "junior": "Junior",
    "middle": "Middle",
    "senior": "Senior",
}


def _format_payload_changes(payload, person=None):
    payload = payload or {}
    fields = payload.get("fields", {})

    opened = []
    closed = []
    changed = []

    for field, value in fields.items():
        if person and hasattr(person, field):
            current_value = getattr(person, field)
            if current_value == value:
                continue
        if field in ["grade", "department_card_access"]:
            continue

        if field in ["brand_scope", "geo_scope", "department_scope"]:
            if value == "selected":
                opened.append(VISIBILITY_FIELD_LABELS.get(field, field))
            elif value == "none":
                closed.append(VISIBILITY_FIELD_LABELS.get(field, field))
            else:
                changed.append(VISIBILITY_FIELD_LABELS.get(field, field))
            continue

        label = VISIBILITY_FIELD_LABELS.get(field)
        if not label:
            continue

        if value is True:
            opened.append(label)
        elif value is False:
            closed.append(label)
        else:
            changed.append(label)

    if payload.get("visibility_brand_ids"):
        opened.append(f"Вибрані бренди ({len(payload.get('visibility_brand_ids', []))})")

    if payload.get("visibility_geo_ids"):
        opened.append(f"Вибрані GEO ({len(payload.get('visibility_geo_ids', []))})")

    if payload.get("visibility_department_ids"):
        opened.append(f"Вибрані відділи ({len(payload.get('visibility_department_ids', []))})")

    compact_changes = []
    compact_changes.extend([f"Відкрити: {item}" for item in opened[:6]])
    compact_changes.extend([f"Закрити: {item}" for item in closed[:4]])
    compact_changes.extend([f"Змінити: {item}" for item in changed[:4]])

    total_changes = len(opened) + len(closed) + len(changed)
    hidden_count = max(total_changes - len(compact_changes), 0)

    return {
        "grade": GRADE_LABELS.get(fields.get("grade"), fields.get("grade", "—")),
        "access_level": ACCESS_LEVEL_LABELS.get(
            fields.get("department_card_access"),
            fields.get("department_card_access", "—"),
        ),
        "opened_count": len(opened),
        "closed_count": len(closed),
        "changed_count": len(changed),
        "total_changes": total_changes,
        "hidden_count": hidden_count,
        "compact_changes": compact_changes,
        "opened": opened,
        "closed": closed,
        "changed": changed,
    }


def _sync_visibility_scope_links(person, brand_ids, geo_ids, department_ids):
    PersonVisibilityBrand.query.filter_by(person_id=person.id).delete()
    PersonVisibilityGeo.query.filter_by(person_id=person.id).delete()
    PersonVisibilityDepartment.query.filter_by(person_id=person.id).delete()

    for brand_id in brand_ids:
        db.session.add(PersonVisibilityBrand(person_id=person.id, brand_id=brand_id))

    for geo_id in geo_ids:
        db.session.add(PersonVisibilityGeo(person_id=person.id, geo_id=geo_id))

    for department_id in department_ids:
        db.session.add(PersonVisibilityDepartment(person_id=person.id, department_id=department_id))



@roles_bp.route("")
@login_required
def list_roles():
    people_query = Person.query.filter_by(is_archived=False)

    accessible_ids = get_accessible_department_ids()
    if accessible_ids is not None:
        people_query = people_query.filter(Person.department_id.in_(accessible_ids))

    people = people_query.order_by(Person.full_name.asc()).all()

    requests = []
    if is_global_admin():
        requests = (
            VisibilityChangeRequest.query
            .order_by(VisibilityChangeRequest.created_at.desc())
            .all()
        )

        for item in requests:
            item.change_view = _format_payload_changes(item.payload, item.person)
            item.formatted_changes = item.change_view["compact_changes"]

    pending_count = sum(1 for r in requests if r.status == "pending")

    return render_template(
        "roles/list.html",
        people=people,
        requests=requests,
        pending_count=pending_count,
        can_review_visibility_requests=is_global_admin(),
    )


@roles_bp.route("/requests/<int:request_id>/approve", methods=["POST"])
@login_required
def approve_visibility_request(request_id):
    item = VisibilityChangeRequest.query.get_or_404(request_id)

    if current_user.admin_role not in ["super_admin", "admin"]:
        flash("Немає доступу", "danger")
        return redirect(url_for("roles.list_roles"))

    if item.status != "pending":
        flash("Запит вже оброблено", "warning")
        return redirect(url_for("roles.list_roles"))

    person = item.person
    payload = item.payload or {}

    old_data = {
        "person_id": person.id,
        "grade": person.grade,
        "brand_scope": person.brand_scope,
        "geo_scope": person.geo_scope,
        "department_scope": person.department_scope,
        "department_card_access": person.department_card_access,
    }

    fields = payload.get("fields", {})
    for field, value in fields.items():
        if hasattr(person, field):
            setattr(person, field, value)

    _sync_visibility_scope_links(
        person,
        payload.get("visibility_brand_ids", []),
        payload.get("visibility_geo_ids", []),
        payload.get("visibility_department_ids", []),
    )

    item.status = "approved"
    item.reviewed_by_id = current_user.id
    item.reviewed_at = datetime.utcnow()
    item.review_comment = request.form.get("review_comment") or None

    db.session.commit()

    log_action(
        entity_type="visibility_request",
        entity_id=item.id,
        action="approve",
        old_data=old_data,
        new_data={
            "person_id": person.id,
            "payload": payload,
            "status": item.status,
        },
    )
    db.session.commit()

    flash("Запит підтверджено", "success")
    return redirect(url_for("roles.list_roles"))


@roles_bp.route("/requests/<int:request_id>/reject", methods=["POST"])
@login_required
def reject_visibility_request(request_id):
    item = VisibilityChangeRequest.query.get_or_404(request_id)

    if current_user.admin_role not in ["super_admin", "admin"]:
        flash("Немає доступу", "danger")
        return redirect(url_for("roles.list_roles"))

    if item.status != "pending":
        flash("Запит вже оброблено", "warning")
        return redirect(url_for("roles.list_roles"))

    item.status = "rejected"
    item.reviewed_by_id = current_user.id
    item.reviewed_at = datetime.utcnow()
    item.review_comment = request.form.get("review_comment") or None

    db.session.commit()

    log_action(
        entity_type="visibility_request",
        entity_id=item.id,
        action="reject",
        new_data={
            "person_id": item.person_id,
            "payload": item.payload,
            "status": item.status,
        },
    )
    db.session.commit()

    flash("Запит відхилено", "success")
    return redirect(url_for("roles.list_roles"))