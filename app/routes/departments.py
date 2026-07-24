from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required

from app.extensions import db
from app.models import (
    Brand,
    Department,
    DepartmentBrand,
    DepartmentGeo,
    DepartmentLead,
    DepartmentTag,
    DepartmentType,
    Geo,
    Person,
    Tag,
)
from app.utils.audit import log_action
from app.utils.access import get_accessible_department_ids, is_global_admin


departments_bp = Blueprint("departments", __name__, url_prefix="/departments")


def _common_context():
    departments_query = Department.query.filter_by(is_archived=False)
    people_query = Person.query.filter_by(is_archived=False)

    accessible_ids = get_accessible_department_ids()
    if accessible_ids is not None:
        departments_query = departments_query.filter(Department.id.in_(accessible_ids))
        people_query = people_query.filter(Person.department_id.in_(accessible_ids))

    return {
        "department_types": DepartmentType.query.order_by(DepartmentType.name.asc()).all(),
        "brands": Brand.query.order_by(Brand.name.asc()).all(),
        "geos": Geo.query.order_by(Geo.name.asc()).all(),
        "tags": Tag.query.order_by(Tag.name.asc()).all(),
        "departments": departments_query.order_by(Department.name.asc()).all(),
        "people": people_query.order_by(Person.full_name.asc()).all(),
        "size_options": ["small", "medium", "large"],
    }


def _set_department_multi_values(dep, brand_ids, geo_ids, tag_ids, lead_ids):
    DepartmentBrand.query.filter_by(department_id=dep.id).delete()
    DepartmentGeo.query.filter_by(department_id=dep.id).delete()
    DepartmentTag.query.filter_by(department_id=dep.id).delete()
    DepartmentLead.query.filter_by(department_id=dep.id).delete()

    for brand_id in brand_ids:
        db.session.add(DepartmentBrand(department_id=dep.id, brand_id=brand_id))

    for geo_id in geo_ids:
        db.session.add(DepartmentGeo(department_id=dep.id, geo_id=geo_id))

    for tag_id in tag_ids:
        db.session.add(DepartmentTag(department_id=dep.id, tag_id=tag_id))

    seen_lead_ids = set()
    for person_id in lead_ids:
        if person_id in seen_lead_ids:
            continue
        seen_lead_ids.add(person_id)
        db.session.add(
            DepartmentLead(
                department_id=dep.id,
                person_id=person_id,
                lead_type="head",
            )
        )


def _can_access_department(dep):
    accessible_ids = get_accessible_department_ids()

    if accessible_ids is None:
        return True

    return dep.id in accessible_ids


@departments_bp.route("/")
@login_required
def list_departments():
    query = Department.query.filter_by(is_archived=False)

    accessible_ids = get_accessible_department_ids()
    if accessible_ids is not None:
        query = query.filter(Department.id.in_(accessible_ids))

    search = request.args.get("search", "").strip()
    if search:
        query = query.filter(Department.name.ilike(f"%{search}%"))

    # Filters: type / brand / GEO
    type_id = request.args.get("type_id", type=int)
    if type_id:
        query = query.filter(Department.department_type_id == type_id)

    brand_id = request.args.get("brand_id", type=int)
    if brand_id:
        query = query.filter(
            Department.id.in_(
                db.session.query(DepartmentBrand.department_id).filter(DepartmentBrand.brand_id == brand_id)
            )
        )

    geo_id = request.args.get("geo_id", type=int)
    if geo_id:
        query = query.filter(
            Department.id.in_(
                db.session.query(DepartmentGeo.department_id).filter(DepartmentGeo.geo_id == geo_id)
            )
        )

    page = request.args.get("page", 1, type=int)
    pagination = query.order_by(Department.name.asc()).paginate(page=page, per_page=25, error_out=False)
    total_brands = Brand.query.count()
    total_geos = Geo.query.count()
    return render_template(
        "departments/list.html",
        items=pagination.items,
        pagination=pagination,
        total_brands=total_brands,
        total_geos=total_geos,
        department_types=DepartmentType.query.order_by(DepartmentType.name).all(),
        brands=Brand.query.order_by(Brand.name).all(),
        geos=Geo.query.order_by(Geo.name).all(),
    )


@departments_bp.route("/create", methods=["GET", "POST"])
@login_required
def create_department():
    if not is_global_admin() and not current_user.department_id:
        flash("Немає доступу", "danger")
        return redirect(url_for("dashboard.index"))

    if request.method == "POST":
        name = request.form.get("name", "").strip()
        short_description = request.form.get("short_description", "").strip()
        full_description = request.form.get("full_description", "").strip()
        functions = request.form.get("functions", "").strip()
        department_type_id = request.form.get("department_type_id", type=int)
        size_label = request.form.get("size_label", "").strip()
        parent_department_id = request.form.get("parent_department_id", type=int)
        if not is_global_admin():
            parent_department_id = current_user.department_id
        email = request.form.get("email", "").strip()
        telegram = request.form.get("telegram", "").strip()
        chat_link = request.form.get("chat_link", "").strip()
        notes = request.form.get("notes", "").strip()

        brand_ids = request.form.getlist("brand_ids", type=int)
        geo_ids = request.form.getlist("geo_ids", type=int)
        tag_ids = request.form.getlist("tag_ids", type=int)
        lead_ids = request.form.getlist("lead_ids", type=int)

        if not name:
            flash("Назва відділу обов'язкова", "danger")
            return render_template("departments/create.html", **_common_context())

        existing = Department.query.filter_by(name=name, is_archived=False).first()
        if existing:
            flash("Відділ з такою назвою вже існує", "danger")
            return render_template("departments/create.html", **_common_context())

        dep = Department(
            name=name,
            short_description=short_description or None,
            full_description=full_description or None,
            functions=functions or None,
            department_type_id=department_type_id or None,
            size_label=size_label or None,
            parent_department_id=parent_department_id or None,
            email=email or None,
            telegram=telegram or None,
            chat_link=chat_link or None,
            notes=notes or None,
            created_by=current_user.id,
            updated_by=current_user.id,
        )

        db.session.add(dep)
        db.session.commit()

        _set_department_multi_values(dep, brand_ids, geo_ids, tag_ids, lead_ids)
        db.session.commit()

        log_action(
            entity_type="department",
            entity_id=dep.id,
            action="create",
            new_data={
                "name": dep.name,
                "department_type_id": dep.department_type_id,
                "size_label": dep.size_label,
                "parent_department_id": dep.parent_department_id,
            },
        )
        db.session.commit()

        flash("Відділ створено", "success")
        return redirect(url_for("departments.detail_department", department_id=dep.id))

    return render_template("departments/create.html", **_common_context())


@departments_bp.route("/<int:department_id>")
@login_required
def detail_department(department_id):
    dep = Department.query.get_or_404(department_id)

    if not _can_access_department(dep):
        flash("Немає доступу до цього відділу", "danger")
        return redirect(url_for("dashboard.index"))

    return render_template("departments/detail.html", department=dep)


@departments_bp.route("/<int:department_id>/edit", methods=["GET", "POST"])
@login_required
def edit_department(department_id):
    dep = Department.query.get_or_404(department_id)

    if not _can_access_department(dep):
        flash("Немає доступу до цього відділу", "danger")
        return redirect(url_for("dashboard.index"))

    if request.method == "POST":
        old_data = {
            "name": dep.name,
            "department_type_id": dep.department_type_id,
            "size_label": dep.size_label,
            "parent_department_id": dep.parent_department_id,
        }

        name = request.form.get("name", "").strip()
        short_description = request.form.get("short_description", "").strip()
        full_description = request.form.get("full_description", "").strip()
        functions = request.form.get("functions", "").strip()
        department_type_id = request.form.get("department_type_id", type=int)
        size_label = request.form.get("size_label", "").strip()
        parent_department_id = request.form.get("parent_department_id", type=int)
        if not is_global_admin():
            parent_department_id = dep.parent_department_id
        email = request.form.get("email", "").strip()
        telegram = request.form.get("telegram", "").strip()
        chat_link = request.form.get("chat_link", "").strip()
        notes = request.form.get("notes", "").strip()

        brand_ids = request.form.getlist("brand_ids", type=int)
        geo_ids = request.form.getlist("geo_ids", type=int)
        tag_ids = request.form.getlist("tag_ids", type=int)
        lead_ids = request.form.getlist("lead_ids", type=int)

        if not name:
            flash("Назва відділу обов'язкова", "danger")
            return render_template("departments/edit.html", department=dep, **_common_context())

        existing = Department.query.filter(
            Department.name == name,
            Department.is_archived == False,
            Department.id != dep.id
        ).first()

        if existing:
            flash("Відділ з такою назвою вже існує", "danger")
            return render_template("departments/edit.html", department=dep, **_common_context())

        dep.name = name
        dep.short_description = short_description or None
        dep.full_description = full_description or None
        dep.functions = functions or None
        dep.department_type_id = department_type_id or None
        dep.size_label = size_label or None
        dep.parent_department_id = parent_department_id or None
        dep.email = email or None
        dep.telegram = telegram or None
        dep.chat_link = chat_link or None
        dep.notes = notes or None
        dep.updated_by = current_user.id

        db.session.commit()

        _set_department_multi_values(dep, brand_ids, geo_ids, tag_ids, lead_ids)
        db.session.commit()

        log_action(
            entity_type="department",
            entity_id=dep.id,
            action="update",
            old_data=old_data,
            new_data={
                "name": dep.name,
                "department_type_id": dep.department_type_id,
                "size_label": dep.size_label,
                "parent_department_id": dep.parent_department_id,
            },
        )
        db.session.commit()

        flash("Відділ оновлено", "success")
        return redirect(url_for("departments.detail_department", department_id=dep.id))

    return render_template("departments/edit.html", department=dep, **_common_context())


@departments_bp.route("/archive")
@login_required
def archive_departments():
    query = Department.query.filter_by(is_archived=True)

    accessible_ids = get_accessible_department_ids()
    if accessible_ids is not None:
        query = query.filter(Department.id.in_(accessible_ids))

    items = query.order_by(Department.name.asc()).all()

    return render_template(
        "departments/archive.html",
        items=items,
    )


@departments_bp.route("/<int:department_id>/restore", methods=["POST"])
@login_required
def restore_department(department_id):
    dep = Department.query.get_or_404(department_id)

    if current_user.admin_role not in ["super_admin", "admin"]:
        flash("Немає доступу", "danger")
        return redirect(url_for("dashboard.index"))

    dep.is_archived = False
    dep.updated_by = current_user.id
    db.session.commit()

    log_action(
        entity_type="department",
        entity_id=dep.id,
        action="restore",
        new_data={
            "name": dep.name,
        },
    )
    db.session.commit()

    flash("Відділ відновлено", "success")
    return redirect(url_for("departments.archive_departments"))


@departments_bp.route("/<int:department_id>/archive", methods=["POST"])
@login_required
def archive_department(department_id):
    dep = Department.query.get_or_404(department_id)

    if current_user.admin_role not in ["super_admin", "admin"]:
        flash("Немає доступу", "danger")
        return redirect(url_for("dashboard.index"))

    dep.is_archived = True
    dep.updated_by = current_user.id
    db.session.commit()

    log_action(
        entity_type="department",
        entity_id=dep.id,
        action="archive",
        new_data={
            "name": dep.name,
        },
    )
    db.session.commit()

    flash("Відділ архівовано", "success")
    return redirect(url_for("departments.list_departments"))