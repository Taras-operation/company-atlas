from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required
from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import (
    Brand,
    Department,
    DepartmentLead,
    Geo,
    GeoLocation,
    Person,
    PersonGeoLocation,
    PersonRole,
    PersonTag,
    PersonVisibilityBrand,
    PersonVisibilityDepartment,
    PersonVisibilityGeo,
    Role,
    Tag,
    VisibilityChangeRequest,
    PersonBrand,
    ViewerUser,
)
from app.utils.audit import log_action
from app.utils.access import get_accessible_department_ids, is_global_admin

from app.utils.visibility import normalize_visibility

people_bp = Blueprint("people", __name__, url_prefix="/people")


VISIBILITY_FIELDS = [
    "grade",
    "map_access",
    "map_show_connections",
    "brand_scope",
    "geo_scope",
    "department_scope",
    "department_card_access",
    "card_show_short_description",
    "card_show_full_description",
    "card_show_relations",
    "show_department_people_count",
    "show_department_leads",
    "show_department_lead_positions",
    "show_department_people",
    "show_department_people_positions",
    "show_department_people_responsibility",
    "show_department_email",
    "show_department_telegram",
    "show_department_chat_link",
    "show_lead_contacts",
    "show_lead_email",
    "show_lead_telegram",
    "show_lead_reddy",
    "show_people_contacts",
    "show_people_email",
    "show_people_telegram",
    "show_people_reddy",
]


def _is_admin():
    return is_global_admin()


def _can_access_person(person):
    accessible_ids = get_accessible_department_ids()

    if accessible_ids is None:
        return True

    return person.department_id in accessible_ids


def _common_context(person=None):
    departments_query = Department.query.filter_by(is_archived=False)
    people_query = Person.query.filter_by(is_archived=False)

    if person:
        people_query = people_query.filter(Person.id != person.id)

    accessible_ids = get_accessible_department_ids()
    if accessible_ids is not None:
        departments_query = departments_query.filter(Department.id.in_(accessible_ids))
        people_query = people_query.filter(Person.department_id.in_(accessible_ids))

    return {
        "departments": departments_query.order_by(Department.name.asc()).all(),
        "people": people_query.order_by(Person.full_name.asc()).all(),
        "roles": Role.query.filter_by(is_archived=False).order_by(Role.name.asc()).all(),
        "geo_locations": GeoLocation.query.order_by(GeoLocation.name.asc()).all(),
        "brands": Brand.query.order_by(Brand.name.asc()).all(),
        "geos": Geo.query.order_by(Geo.name.asc()).all(),
        "tags": Tag.query.order_by(Tag.name.asc()).all(),
    }


def _checkbox(name):
    return bool(request.form.get(name))


def _collect_emails():
    """Collect one or more email inputs (name="email") into a newline-separated string."""
    emails = [e.strip() for e in request.form.getlist("email") if e and e.strip()]
    # de-duplicate, keep order
    seen = set()
    unique = []
    for e in emails:
        if e.lower() not in seen:
            seen.add(e.lower())
            unique.append(e)
    return "\n".join(unique) or None


def _collect_visibility_payload():
    return {
        "grade": request.form.get("grade") or "junior",
        "map_access": _checkbox("map_access"),
        "map_show_connections": _checkbox("map_show_connections"),
        "brand_scope": request.form.get("brand_scope") or "all",
        "geo_scope": request.form.get("geo_scope") or "all",
        "department_scope": request.form.get("department_scope") or "all",
        "department_card_access": request.form.get("department_card_access") or "limited",
        "card_show_short_description": _checkbox("card_show_short_description"),
        "card_show_full_description": _checkbox("card_show_full_description"),
        "card_show_relations": _checkbox("card_show_relations"),
        "show_department_people_count": _checkbox("show_department_people_count"),
        "show_department_leads": _checkbox("show_department_leads"),
        "show_department_lead_positions": _checkbox("show_department_lead_positions"),
        "show_department_people": _checkbox("show_department_people"),
        "show_department_people_positions": _checkbox("show_department_people_positions"),
        "show_department_people_responsibility": _checkbox("show_department_people_responsibility"),
        "show_department_email": _checkbox("show_department_email"),
        "show_department_telegram": _checkbox("show_department_telegram"),
        "show_department_chat_link": _checkbox("show_department_chat_link"),
        "show_lead_contacts": _checkbox("show_lead_contacts"),
        "show_lead_email": _checkbox("show_lead_email"),
        "show_lead_telegram": _checkbox("show_lead_telegram"),
        "show_lead_reddy": _checkbox("show_lead_reddy"),
        "show_people_contacts": _checkbox("show_people_contacts"),
        "show_people_email": _checkbox("show_people_email"),
        "show_people_telegram": _checkbox("show_people_telegram"),
        "show_people_reddy": _checkbox("show_people_reddy"),
    }


def _apply_visibility_payload(person, payload):
    for field, value in payload.items():
        if hasattr(person, field):
            setattr(person, field, value)


def _sync_person_links(person, role_ids, geo_location_ids, tag_ids, brand_ids=()):
    PersonRole.query.filter_by(person_id=person.id).delete()
    PersonGeoLocation.query.filter_by(person_id=person.id).delete()
    PersonTag.query.filter_by(person_id=person.id).delete()
    PersonBrand.query.filter_by(person_id=person.id).delete()

    for role_id in role_ids:
        db.session.add(PersonRole(person_id=person.id, role_id=role_id))

    for geo_location_id in geo_location_ids:
        db.session.add(PersonGeoLocation(person_id=person.id, geo_location_id=geo_location_id))

    for tag_id in tag_ids:
        db.session.add(PersonTag(person_id=person.id, tag_id=tag_id))

    for brand_id in brand_ids:
        db.session.add(PersonBrand(person_id=person.id, brand_id=brand_id))


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


def _sync_department_lead_flag(person, is_department_lead):
    DepartmentLead.query.filter_by(person_id=person.id, lead_type="department_lead").delete()

    if is_department_lead and person.department_id:
        db.session.add(
            DepartmentLead(
                department_id=person.department_id,
                person_id=person.id,
                lead_type="department_lead",
            )
        )


def _create_viewer_user_for_person(person):
    if not _is_admin():
        return False

    if person.viewer_user:
        return False

    if request.form.get("create_viewer_access") != "on":
        return False

    username = request.form.get("viewer_username", "").strip()
    password = request.form.get("viewer_password", "").strip()

    if not username or not password:
        flash("Логін та пароль для доступу до візуалізації обов'язкові", "danger")
        return False

    existing = ViewerUser.query.filter_by(username=username).first()
    if existing:
        flash("Такий логін для візуалізації вже існує", "danger")
        return False

    viewer_user = ViewerUser(
        username=username,
        password_hash=generate_password_hash(password, method="pbkdf2:sha256"),
        person_id=person.id,
        is_active_user=True,
    )

    db.session.add(viewer_user)
    db.session.flush()

    log_action(
        entity_type="viewer_user",
        entity_id=viewer_user.id,
        action="create",
        new_data={
            "username": viewer_user.username,
            "person_id": person.id,
        },
    )

    return True


def _update_viewer_user_for_person(person):
    if not _is_admin():
        return

    if person.viewer_user:
        person.viewer_user.is_active_user = request.form.get("viewer_is_active") == "on"

        # Login can be changed; it must stay unique across viewer accounts.
        new_username = request.form.get("viewer_username_edit", "").strip()
        if new_username and new_username != person.viewer_user.username:
            taken = ViewerUser.query.filter(
                ViewerUser.username == new_username,
                ViewerUser.id != person.viewer_user.id,
            ).first()
            if taken:
                flash("Такий логін уже зайнятий — логін не змінено", "danger")
            else:
                old_username = person.viewer_user.username
                person.viewer_user.username = new_username
                log_action(
                    entity_type="viewer_user",
                    entity_id=person.viewer_user.id,
                    action="rename",
                    old_data={"username": old_username},
                    new_data={"username": new_username},
                )

        new_password = request.form.get("new_viewer_password", "").strip()
        if new_password:
            person.viewer_user.password_hash = generate_password_hash(
                new_password,
                method="pbkdf2:sha256",
            )

        return

    _create_viewer_user_for_person(person)


@people_bp.route("")
@login_required
def list_people():
    from app.models import Department
    query = Person.query.filter_by(is_archived=False)

    accessible_ids = get_accessible_department_ids()
    if accessible_ids is not None:
        query = query.filter(Person.department_id.in_(accessible_ids))

    search = request.args.get("search", "").strip()
    if search:
        query = query.filter(Person.full_name.ilike(f"%{search}%"))

    department_id = request.args.get("department_id", "").strip()
    if department_id:
        query = query.filter(Person.department_id == int(department_id))

    grade = request.args.get("grade", "").strip()
    if grade:
        query = query.filter(Person.grade == grade)

    # Departments for filter dropdown (respect TL scope)
    dept_query = Department.query.filter_by(is_archived=False)
    if accessible_ids is not None:
        dept_query = dept_query.filter(Department.id.in_(accessible_ids))
    departments = dept_query.order_by(Department.name.asc()).all()

    page = request.args.get("page", 1, type=int)
    pagination = query.order_by(Person.full_name.asc()).paginate(page=page, per_page=25, error_out=False)
    return render_template(
        "people/list.html",
        items=pagination.items,
        pagination=pagination,
        departments=departments,
        grades=["junior", "middle", "senior"],
    )


@people_bp.route("/create", methods=["GET", "POST"])
@login_required
def create_person():
    context = _common_context()

    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()

        department_id = request.form.get("department_id") or None
        manager_id = request.form.get("manager_id") or None

        accessible_ids = get_accessible_department_ids()
        if accessible_ids is not None:
            if not department_id or int(department_id) not in accessible_ids:
                flash("Немає доступу до цього відділу", "danger")
                return render_template("people/create.html", **context)

        if not full_name:
            flash("Ім'я обов'язкове", "danger")
            return render_template("people/create.html", **context)

        person = Person(
            full_name=full_name,
            position=request.form.get("position") or None,
            department_id=department_id,
            manager_id=manager_id,
            email=_collect_emails(),
            telegram=request.form.get("telegram") or None,
            phone=request.form.get("phone") or None,
            responsibility_area=request.form.get("responsibility_area") or None,
            created_by=current_user.id,
            updated_by=current_user.id,
        )

        if _is_admin():
            _apply_visibility_payload(person, _collect_visibility_payload())
            normalize_visibility(person)
        else:
            person.grade = request.form.get("grade") or "junior"

        db.session.add(person)
        db.session.commit()

        _sync_person_links(
            person,
            request.form.getlist("role_ids", type=int),
            request.form.getlist("geo_location_ids", type=int),
            request.form.getlist("tag_ids", type=int),
            request.form.getlist("person_brand_ids", type=int),
        )

        if _is_admin():
            _sync_visibility_scope_links(
                person,
                request.form.getlist("visibility_brand_ids", type=int),
                request.form.getlist("visibility_geo_ids", type=int),
                request.form.getlist("visibility_department_ids", type=int),
            )

        _sync_department_lead_flag(person, request.form.get("is_department_lead") == "on")

        _create_viewer_user_for_person(person)

        db.session.commit()

        log_action(
            entity_type="person",
            entity_id=person.id,
            action="create",
            new_data={
                "full_name": person.full_name,
                "department_id": person.department_id,
                "position": person.position,
            },
        )
        db.session.commit()

        flash("Людину створено", "success")
        return redirect(url_for("people.detail_person", person_id=person.id))

    return render_template("people/create.html", **context)


@people_bp.route("/<int:person_id>")
@login_required
def detail_person(person_id):
    person = Person.query.get_or_404(person_id)
    if not _can_access_person(person):
        flash("Немає доступу до цієї людини", "danger")
        return redirect(url_for("people.list_people"))
    return render_template("people/detail.html", person=person)


@people_bp.route("/<int:person_id>/edit", methods=["GET", "POST"])
@login_required
def edit_person(person_id):
    person = Person.query.get_or_404(person_id)
    if not _can_access_person(person):
        flash("Немає доступу до цієї людини", "danger")
        return redirect(url_for("people.list_people"))
    context = _common_context(person=person)

    if request.method == "POST":
        old_data = {
            "full_name": person.full_name,
            "department_id": person.department_id,
            "position": person.position,
            "grade": person.grade,
        }

        full_name = request.form.get("full_name", "").strip()

        department_id = request.form.get("department_id") or None
        manager_id = request.form.get("manager_id") or None

        accessible_ids = get_accessible_department_ids()
        if accessible_ids is not None:
            if not department_id or int(department_id) not in accessible_ids:
                flash("Немає доступу до цього відділу", "danger")
                return render_template("people/edit.html", person=person, **context)

        if not full_name:
            flash("Ім'я обов'язкове", "danger")
            return render_template("people/edit.html", person=person, **context)

        person.full_name = full_name
        person.position = request.form.get("position") or None
        person.department_id = department_id
        person.manager_id = manager_id
        person.email = _collect_emails()
        person.telegram = request.form.get("telegram") or None
        person.phone = request.form.get("phone") or None
        person.responsibility_area = request.form.get("responsibility_area") or None
        person.updated_by = current_user.id

        visibility_payload = _collect_visibility_payload()

        if _is_admin():
            _apply_visibility_payload(person, visibility_payload)
            normalize_visibility(person)

            _sync_visibility_scope_links(
                person,
                request.form.getlist("visibility_brand_ids", type=int),
                request.form.getlist("visibility_geo_ids", type=int),
                request.form.getlist("visibility_department_ids", type=int),
            )

            flash("Людину оновлено", "success")
        else:
            request_payload = {
                "fields": visibility_payload,
                "visibility_brand_ids": request.form.getlist("visibility_brand_ids", type=int),
                "visibility_geo_ids": request.form.getlist("visibility_geo_ids", type=int),
                "visibility_department_ids": request.form.getlist("visibility_department_ids", type=int),
            }

            db.session.add(
                VisibilityChangeRequest(
                    person_id=person.id,
                    requested_by_id=current_user.id,
                    payload=request_payload,
                    comment=request.form.get("visibility_comment") or None,
                )
            )

            flash("Основні дані оновлено. Зміни видимості відправлено адміну на погодження.", "success")

        _sync_person_links(
            person,
            request.form.getlist("role_ids", type=int),
            request.form.getlist("geo_location_ids", type=int),
            request.form.getlist("tag_ids", type=int),
            request.form.getlist("person_brand_ids", type=int),
        )

        _sync_department_lead_flag(person, request.form.get("is_department_lead") == "on")

        _update_viewer_user_for_person(person)

        db.session.commit()

        log_action(
            entity_type="person",
            entity_id=person.id,
            action="update",
            old_data=old_data,
            new_data={
                "full_name": person.full_name,
                "department_id": person.department_id,
                "position": person.position,
                "grade": person.grade,
            },
        )
        db.session.commit()

        return redirect(url_for("people.detail_person", person_id=person.id))

    return render_template("people/edit.html", person=person, **context)


@people_bp.route("/archive")
@login_required
def archive_people():
    query = Person.query.filter_by(is_archived=True)

    accessible_ids = get_accessible_department_ids()
    if accessible_ids is not None:
        query = query.filter(Person.department_id.in_(accessible_ids))

    items = query.order_by(Person.full_name.asc()).all()
    return render_template("people/archive.html", items=items)


@people_bp.route("/<int:person_id>/restore", methods=["POST"])
@login_required
def restore_person(person_id):
    person = Person.query.get_or_404(person_id)
    if not _can_access_person(person):
        flash("Немає доступу до цієї людини", "danger")
        return redirect(url_for("people.archive_people"))
    person.is_archived = False
    person.updated_by = current_user.id
    db.session.commit()

    log_action(
        entity_type="person",
        entity_id=person.id,
        action="restore",
        new_data={
            "full_name": person.full_name,
        },
    )
    db.session.commit()

    flash("Людину відновлено", "success")
    return redirect(url_for("people.archive_people"))


@people_bp.route("/<int:person_id>/delete", methods=["POST"])
@login_required
def delete_person(person_id):
    """Permanently remove a person (e.g. they left the company).

    Archiving is the softer option; this wipes the record. References that must
    survive are cleared first, the rest cascade via the relationship config.
    """
    person = Person.query.get_or_404(person_id)

    if not _is_admin():
        flash("Видаляти людей може лише адміністратор", "danger")
        return redirect(url_for("people.detail_person", person_id=person.id))

    if not _can_access_person(person):
        flash("Немає доступу до цієї людини", "danger")
        return redirect(url_for("people.list_people"))

    full_name = person.full_name

    # Keep subordinates intact — just detach them from this manager.
    Person.query.filter_by(manager_id=person.id).update({"manager_id": None})

    # An admin account must not disappear with the person; unlink it instead.
    if person.admin_user:
        person.admin_user.person_id = None

    log_action(
        entity_type="person",
        entity_id=person.id,
        action="delete",
        old_data={"full_name": full_name, "department_id": person.department_id},
    )

    db.session.delete(person)
    db.session.commit()

    flash(f"Людину «{full_name}» видалено", "success")
    return redirect(url_for("people.list_people"))


@people_bp.route("/<int:person_id>/archive", methods=["POST"])
@login_required
def archive_person(person_id):
    person = Person.query.get_or_404(person_id)
    if not _can_access_person(person):
        flash("Немає доступу до цієї людини", "danger")
        return redirect(url_for("people.list_people"))
    person.is_archived = True
    person.updated_by = current_user.id
    db.session.commit()

    log_action(
        entity_type="person",
        entity_id=person.id,
        action="archive",
        new_data={
            "full_name": person.full_name,
        },
    )
    db.session.commit()

    flash("Людину архівовано", "success")
    return redirect(url_for("people.list_people"))


# ViewerUser management routes

@people_bp.route("/<int:person_id>/viewer-access/create", methods=["POST"])
@login_required
def create_viewer_access(person_id):
    if not _is_admin():
        flash("Немає доступу", "danger")
        return redirect(url_for("people.detail_person", person_id=person_id))

    person = Person.query.get_or_404(person_id)

    if person.viewer_user:
        flash("Viewer доступ вже існує", "warning")
        return redirect(url_for("people.detail_person", person_id=person.id))

    username = request.form.get("viewer_username", "").strip()
    password = request.form.get("viewer_password", "").strip()

    if not username or not password:
        flash("Логін та пароль обов'язкові", "danger")
        return redirect(url_for("people.detail_person", person_id=person.id))

    existing = ViewerUser.query.filter_by(username=username).first()
    if existing:
        flash("Такий логін вже існує", "danger")
        return redirect(url_for("people.detail_person", person_id=person.id))

    viewer_user = ViewerUser(
        username=username,
        password_hash=generate_password_hash(password, method="pbkdf2:sha256"),
        person_id=person.id,
    )

    db.session.add(viewer_user)
    db.session.commit()

    log_action(
        entity_type="viewer_user",
        entity_id=viewer_user.id,
        action="create",
        new_data={
            "username": viewer_user.username,
            "person_id": person.id,
        },
    )
    db.session.commit()

    flash("Viewer доступ створено", "success")
    return redirect(url_for("people.detail_person", person_id=person.id))


@people_bp.route("/<int:person_id>/viewer-access/toggle", methods=["POST"])
@login_required
def toggle_viewer_access(person_id):
    if not _is_admin():
        flash("Немає доступу", "danger")
        return redirect(url_for("people.detail_person", person_id=person_id))

    person = Person.query.get_or_404(person_id)

    if not person.viewer_user:
        flash("Viewer доступ не знайдено", "danger")
        return redirect(url_for("people.detail_person", person_id=person.id))

    person.viewer_user.is_active_user = not person.viewer_user.is_active_user
    db.session.commit()

    flash("Статус viewer доступу оновлено", "success")
    return redirect(url_for("people.detail_person", person_id=person.id))


@people_bp.route("/<int:person_id>/viewer-access/reset-password", methods=["POST"])
@login_required
def reset_viewer_password(person_id):
    if not _is_admin():
        flash("Немає доступу", "danger")
        return redirect(url_for("people.detail_person", person_id=person_id))

    person = Person.query.get_or_404(person_id)

    if not person.viewer_user:
        flash("Viewer доступ не знайдено", "danger")
        return redirect(url_for("people.detail_person", person_id=person.id))

    new_password = request.form.get("new_viewer_password", "").strip()

    if not new_password:
        flash("Новий пароль обов'язковий", "danger")
        return redirect(url_for("people.detail_person", person_id=person.id))

    person.viewer_user.password_hash = generate_password_hash(
        new_password,
        method="pbkdf2:sha256",
    )
    db.session.commit()

    flash("Пароль viewer доступу оновлено", "success")
    return redirect(url_for("people.detail_person", person_id=person.id))