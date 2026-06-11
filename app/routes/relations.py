from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required
from sqlalchemy import or_

from app.extensions import db
from app.models import Department, DepartmentRelation, Person
from app.utils.audit import log_action
from app.utils.access import get_accessible_department_ids

relations_bp = Blueprint("relations", __name__, url_prefix="/relations")


def _common_context():
    departments_from_query = Department.query.filter_by(is_archived=False)
    departments_to_query = Department.query.filter_by(is_archived=False)
    people_from_query = Person.query.filter_by(is_archived=False)
    people_to_query = Person.query.filter_by(is_archived=False)

    accessible_ids = get_accessible_department_ids()
    if accessible_ids is not None:
        departments_from_query = departments_from_query.filter(
            Department.id.in_(accessible_ids)
        )
        people_from_query = people_from_query.filter(
            Person.department_id.in_(accessible_ids)
        )

    departments_from = departments_from_query.order_by(Department.name.asc()).all()
    departments_to = departments_to_query.order_by(Department.name.asc()).all()
    people_from = people_from_query.order_by(Person.full_name.asc()).all()
    people_to = people_to_query.order_by(Person.full_name.asc()).all()

    return {
        "departments": departments_from,
        "departments_from": departments_from,
        "departments_to": departments_to,
        "people": people_from,
        "people_from": people_from,
        "people_to": people_to,
    }


def _normalize_id(value):
    return int(value) if value else None


def _person_belongs_to_department(person_id, department_id):
    if not person_id:
        return True

    person = Person.query.get(person_id)
    return bool(person and person.department_id == department_id)


def _departments_are_accessible(department_from_id, department_to_id):
    accessible_ids = get_accessible_department_ids()

    if accessible_ids is None:
        return True

    return department_from_id in accessible_ids or department_to_id in accessible_ids


@relations_bp.route("")
@login_required
def list_relations():
    query = DepartmentRelation.query.filter_by(is_archived=False)

    accessible_ids = get_accessible_department_ids()
    if accessible_ids is not None:
        query = query.filter(
            or_(
                DepartmentRelation.department_from_id.in_(accessible_ids),
                DepartmentRelation.department_to_id.in_(accessible_ids),
            )
        )

    status_filter = request.args.get("status", "").strip()
    if status_filter in ("active", "draft", "paused"):
        query = query.filter(DepartmentRelation.status == status_filter)

    strength_filter = request.args.get("strength", "").strip()
    if strength_filter in ("low", "medium", "high"):
        query = query.filter(DepartmentRelation.strength == strength_filter)

    page = request.args.get("page", 1, type=int)
    pagination = query.order_by(DepartmentRelation.created_at.desc()).paginate(page=page, per_page=25, error_out=False)
    return render_template("relations/list.html", items=pagination.items, pagination=pagination)


@relations_bp.route("/create", methods=["GET", "POST"])
@login_required
def create_relation():
    context = _common_context()

    if request.method == "POST":
        department_from_id = _normalize_id(request.form.get("department_from_id"))
        department_to_id = _normalize_id(request.form.get("department_to_id"))

        if not department_from_id or not department_to_id:
            flash("Оберіть обидва відділи", "danger")
            return render_template("relations/create.html", **context)

        if department_from_id == department_to_id:
            flash("Відділи не можуть бути однаковими", "danger")
            return render_template("relations/create.html", **context)

        if not _departments_are_accessible(department_from_id, department_to_id):
            flash("Немає доступу до обраних відділів", "danger")
            return render_template("relations/create.html", **context)

        responsible_person_from_id = _normalize_id(request.form.get("responsible_person_from_id"))
        responsible_person_to_id = _normalize_id(request.form.get("responsible_person_to_id"))

        if not _person_belongs_to_department(responsible_person_from_id, department_from_id):
            flash("Відповідальний з боку A має належати до відділу A", "danger")
            return render_template("relations/create.html", **context)

        if not _person_belongs_to_department(responsible_person_to_id, department_to_id):
            flash("Відповідальний з боку B має належати до відділу B", "danger")
            return render_template("relations/create.html", **context)

        relation = DepartmentRelation(
            department_from_id=department_from_id,
            department_to_id=department_to_id,
            direction=request.form.get("direction") or "from_to",
            strength=request.form.get("strength") or "medium",
            show_on_map=bool(request.form.get("show_on_map")),
            status=request.form.get("status") or "active",
            short_description=request.form.get("short_description") or None,
            notes=request.form.get("notes") or None,
            responsible_person_from_id=responsible_person_from_id,
            responsible_person_to_id=responsible_person_to_id,
            created_by=current_user.id,
            updated_by=current_user.id,
        )

        db.session.add(relation)
        db.session.commit()

        log_action(
            entity_type="relation",
            entity_id=relation.id,
            action="create",
            new_data={
                "department_from_id": relation.department_from_id,
                "department_to_id": relation.department_to_id,
                "direction": relation.direction,
                "strength": relation.strength,
                "status": relation.status,
                "show_on_map": relation.show_on_map,
            },
        )
        db.session.commit()

        flash("Зв’язок створено", "success")
        return redirect(url_for("relations.list_relations"))

    return render_template("relations/create.html", **context)


@relations_bp.route("/<int:relation_id>/edit", methods=["GET", "POST"])
@login_required
def edit_relation(relation_id):
    relation = DepartmentRelation.query.get_or_404(relation_id)
    accessible_ids = get_accessible_department_ids()

    if accessible_ids is not None and (
        relation.department_from_id not in accessible_ids
        and relation.department_to_id not in accessible_ids
    ):
        flash("Немає доступу до цього зв’язку", "danger")
        return redirect(url_for("relations.list_relations"))

    context = _common_context()

    if request.method == "POST":
        old_data = {
            "department_from_id": relation.department_from_id,
            "department_to_id": relation.department_to_id,
            "direction": relation.direction,
            "strength": relation.strength,
            "status": relation.status,
            "show_on_map": relation.show_on_map,
        }

        department_from_id = _normalize_id(request.form.get("department_from_id"))
        department_to_id = _normalize_id(request.form.get("department_to_id"))

        if not department_from_id or not department_to_id:
            flash("Оберіть обидва відділи", "danger")
            return render_template("relations/edit.html", relation=relation, **context)

        if department_from_id == department_to_id:
            flash("Відділи не можуть бути однаковими", "danger")
            return render_template("relations/edit.html", relation=relation, **context)

        if not _departments_are_accessible(department_from_id, department_to_id):
            flash("Немає доступу до обраних відділів", "danger")
            return render_template("relations/edit.html", relation=relation, **context)

        responsible_person_from_id = _normalize_id(request.form.get("responsible_person_from_id"))
        responsible_person_to_id = _normalize_id(request.form.get("responsible_person_to_id"))

        if not _person_belongs_to_department(responsible_person_from_id, department_from_id):
            flash("Відповідальний з боку A має належати до відділу A", "danger")
            return render_template("relations/edit.html", relation=relation, **context)

        if not _person_belongs_to_department(responsible_person_to_id, department_to_id):
            flash("Відповідальний з боку B має належати до відділу B", "danger")
            return render_template("relations/edit.html", relation=relation, **context)

        relation.department_from_id = department_from_id
        relation.department_to_id = department_to_id
        relation.direction = request.form.get("direction") or "from_to"
        relation.strength = request.form.get("strength") or "medium"
        relation.show_on_map = bool(request.form.get("show_on_map"))
        relation.status = request.form.get("status") or "active"
        relation.short_description = request.form.get("short_description") or None
        relation.notes = request.form.get("notes") or None
        relation.responsible_person_from_id = responsible_person_from_id
        relation.responsible_person_to_id = responsible_person_to_id
        relation.updated_by = current_user.id

        db.session.commit()

        log_action(
            entity_type="relation",
            entity_id=relation.id,
            action="update",
            old_data=old_data,
            new_data={
                "department_from_id": relation.department_from_id,
                "department_to_id": relation.department_to_id,
                "direction": relation.direction,
                "strength": relation.strength,
                "status": relation.status,
                "show_on_map": relation.show_on_map,
            },
        )
        db.session.commit()

        flash("Зв’язок оновлено", "success")
        return redirect(url_for("relations.list_relations"))

    return render_template("relations/edit.html", relation=relation, **context)


@relations_bp.route("/archive")
@login_required
def archive_relations():
    query = DepartmentRelation.query.filter_by(is_archived=True)

    accessible_ids = get_accessible_department_ids()
    if accessible_ids is not None:
        query = query.filter(
            or_(
                DepartmentRelation.department_from_id.in_(accessible_ids),
                DepartmentRelation.department_to_id.in_(accessible_ids),
            )
        )

    items = query.order_by(DepartmentRelation.created_at.desc()).all()

    return render_template("relations/archive.html", items=items)


@relations_bp.route("/<int:relation_id>/restore", methods=["POST"])
@login_required
def restore_relation(relation_id):
    relation = DepartmentRelation.query.get_or_404(relation_id)
    accessible_ids = get_accessible_department_ids()

    if accessible_ids is not None and (
        relation.department_from_id not in accessible_ids
        and relation.department_to_id not in accessible_ids
    ):
        flash("Немає доступу до цього зв’язку", "danger")
        return redirect(url_for("relations.archive_relations"))

    relation.is_archived = False
    relation.updated_by = current_user.id
    db.session.commit()

    log_action(
        entity_type="relation",
        entity_id=relation.id,
        action="restore",
        new_data={
            "department_from_id": relation.department_from_id,
            "department_to_id": relation.department_to_id,
        },
    )
    db.session.commit()

    flash("Зв’язок відновлено", "success")
    return redirect(url_for("relations.archive_relations"))


@relations_bp.route("/<int:relation_id>/archive", methods=["POST"])
@login_required
def archive_relation(relation_id):
    relation = DepartmentRelation.query.get_or_404(relation_id)
    accessible_ids = get_accessible_department_ids()

    if accessible_ids is not None and (
        relation.department_from_id not in accessible_ids
        and relation.department_to_id not in accessible_ids
    ):
        flash("Немає доступу до цього зв’язку", "danger")
        return redirect(url_for("relations.list_relations"))

    relation.is_archived = True
    relation.updated_by = current_user.id
    db.session.commit()

    log_action(
        entity_type="relation",
        entity_id=relation.id,
        action="archive",
        new_data={
            "department_from_id": relation.department_from_id,
            "department_to_id": relation.department_to_id,
        },
    )
    db.session.commit()

    flash("Зв’язок архівовано", "success")
    return redirect(url_for("relations.list_relations"))