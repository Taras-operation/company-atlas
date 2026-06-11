from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import login_required, current_user
from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import (
    AdminUser,
    Brand,
    Department,
    DepartmentType,
    Geo,
    GeoLocation,
    Person,
    Tag,
)
from app.utils.audit import log_action


settings_bp = Blueprint("settings", __name__, url_prefix="/settings")


def _admin_only():
    return current_user.admin_role in ["super_admin", "admin"]


@settings_bp.before_request
@login_required
def require_login():
    if not _admin_only():
        flash("Немає доступу до налаштувань", "danger")
        return redirect(url_for("dashboard.index"))


@settings_bp.route("/")
def index():
    return render_template("settings/index.html")


@settings_bp.route("/brands", methods=["GET", "POST"])
def brands():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        description = request.form.get("description", "").strip()

        if not name:
            flash("Назва бренду обов'язкова", "danger")
            return redirect(url_for("settings.brands"))

        existing = Brand.query.filter_by(name=name).first()
        if existing:
            flash("Бренд з такою назвою вже існує", "danger")
            return redirect(url_for("settings.brands"))

        item = Brand(name=name, description=description or None)
        db.session.add(item)
        db.session.commit()

        log_action(
            entity_type="brand",
            entity_id=item.id,
            action="create",
            new_data={"name": item.name},
        )
        db.session.commit()

        flash("Бренд додано", "success")
        return redirect(url_for("settings.brands"))

    items = Brand.query.order_by(Brand.name.asc()).all()
    edit_id = request.args.get("edit_id", type=int)
    edit_item = Brand.query.get(edit_id) if edit_id else None
    return render_template("settings/brands.html", items=items, edit_item=edit_item)


@settings_bp.route("/department-types", methods=["GET", "POST"])
def department_types():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        description = request.form.get("description", "").strip()

        if not name:
            flash("Назва типу відділу обов'язкова", "danger")
            return redirect(url_for("settings.department_types"))

        existing = DepartmentType.query.filter_by(name=name).first()
        if existing:
            flash("Такий тип відділу вже існує", "danger")
            return redirect(url_for("settings.department_types"))

        item = DepartmentType(name=name, description=description or None)
        db.session.add(item)
        db.session.commit()

        log_action(
            entity_type="department_type",
            entity_id=item.id,
            action="create",
            new_data={"name": item.name},
        )
        db.session.commit()

        flash("Тип відділу додано", "success")
        return redirect(url_for("settings.department_types"))

    items = DepartmentType.query.order_by(DepartmentType.name.asc()).all()
    edit_id = request.args.get("edit_id", type=int)
    edit_item = DepartmentType.query.get(edit_id) if edit_id else None
    return render_template("settings/department_types.html", items=items, edit_item=edit_item)


@settings_bp.route("/geos", methods=["GET", "POST"])
def geos():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        code = request.form.get("code", "").strip()
        description = request.form.get("description", "").strip()

        if not name:
            flash("Назва GEO обов'язкова", "danger")
            return redirect(url_for("settings.geos"))

        existing = Geo.query.filter_by(name=name).first()
        if existing:
            flash("GEO з такою назвою вже існує", "danger")
            return redirect(url_for("settings.geos"))

        item = Geo(
            name=name,
            code=code or None,
            description=description or None,
        )
        db.session.add(item)
        db.session.commit()

        log_action(
            entity_type="geo",
            entity_id=item.id,
            action="create",
            new_data={"name": item.name, "code": item.code},
        )
        db.session.commit()

        flash("GEO додано", "success")
        return redirect(url_for("settings.geos"))

    items = Geo.query.order_by(Geo.name.asc()).all()
    edit_id = request.args.get("edit_id", type=int)
    edit_item = Geo.query.get(edit_id) if edit_id else None
    return render_template("settings/geos.html", items=items, edit_item=edit_item)


@settings_bp.route("/geo-locations", methods=["GET", "POST"])
def geo_locations():
    if request.method == "POST":
        geo_id = request.form.get("geo_id", type=int)
        name = request.form.get("name", "").strip()
        location_type = request.form.get("location_type", "").strip()
        description = request.form.get("description", "").strip()

        if not geo_id or not name or not location_type:
            flash("GEO, назва та тип локації обов'язкові", "danger")
            return redirect(url_for("settings.geo_locations"))

        existing = GeoLocation.query.filter_by(geo_id=geo_id, name=name).first()
        if existing:
            flash("Така локація вже існує в цьому GEO", "danger")
            return redirect(url_for("settings.geo_locations"))

        item = GeoLocation(
            geo_id=geo_id,
            name=name,
            location_type=location_type,
            description=description or None,
        )
        db.session.add(item)
        db.session.commit()

        log_action(
            entity_type="geo_location",
            entity_id=item.id,
            action="create",
            new_data={
                "geo_id": item.geo_id,
                "name": item.name,
                "location_type": item.location_type,
            },
        )
        db.session.commit()

        flash("Локацію GEO додано", "success")
        return redirect(url_for("settings.geo_locations"))

    items = GeoLocation.query.order_by(GeoLocation.name.asc()).all()
    geos = Geo.query.order_by(Geo.name.asc()).all()
    return render_template("settings/geo_locations.html", items=items, geos=geos)


@settings_bp.route("/tags", methods=["GET", "POST"])
def tags():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        tag_type = request.form.get("tag_type", "").strip()
        description = request.form.get("description", "").strip()

        if not name:
            flash("Назва тегу обов'язкова", "danger")
            return redirect(url_for("settings.tags"))

        existing = Tag.query.filter_by(name=name).first()
        if existing:
            flash("Тег з такою назвою вже існує", "danger")
            return redirect(url_for("settings.tags"))

        item = Tag(
            name=name,
            tag_type=tag_type or "common",
            description=description or None,
        )
        db.session.add(item)
        db.session.commit()

        log_action(
            entity_type="tag",
            entity_id=item.id,
            action="create",
            new_data={"name": item.name, "tag_type": item.tag_type},
        )
        db.session.commit()

        flash("Тег додано", "success")
        return redirect(url_for("settings.tags"))

    items = Tag.query.order_by(Tag.name.asc()).all()
    edit_id = request.args.get("edit_id", type=int)
    edit_item = Tag.query.get(edit_id) if edit_id else None
    return render_template("settings/tags.html", items=items, edit_item=edit_item)


# ── Brand edit / delete ────────────────────────────────────────────────────

@settings_bp.route("/brands/<int:item_id>/edit", methods=["POST"])
def edit_brand(item_id):
    item = Brand.query.get_or_404(item_id)
    name = request.form.get("name", "").strip()
    description = request.form.get("description", "").strip()
    if not name:
        flash("Назва обов'язкова", "danger")
    else:
        old_name = item.name
        item.name = name
        item.description = description or None
        db.session.commit()
        log_action(entity_type="brand", entity_id=item.id, action="update",
                   old_data={"name": old_name}, new_data={"name": item.name})
        db.session.commit()
        flash("Бренд оновлено", "success")
    return redirect(url_for("settings.brands"))


@settings_bp.route("/brands/<int:item_id>/delete", methods=["POST"])
def delete_brand(item_id):
    item = Brand.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    flash("Бренд видалено", "success")
    return redirect(url_for("settings.brands"))


# ── DepartmentType edit / delete ──────────────────────────────────────────

@settings_bp.route("/department-types/<int:item_id>/edit", methods=["POST"])
def edit_department_type(item_id):
    item = DepartmentType.query.get_or_404(item_id)
    name = request.form.get("name", "").strip()
    description = request.form.get("description", "").strip()
    if not name:
        flash("Назва обов'язкова", "danger")
    else:
        item.name = name
        item.description = description or None
        db.session.commit()
        flash("Тип відділу оновлено", "success")
    return redirect(url_for("settings.department_types"))


@settings_bp.route("/department-types/<int:item_id>/delete", methods=["POST"])
def delete_department_type(item_id):
    item = DepartmentType.query.get_or_404(item_id)
    if item.departments:
        flash(f"Неможливо видалити: тип використовується у {len(item.departments)} відділах", "danger")
        return redirect(url_for("settings.department_types"))
    db.session.delete(item)
    db.session.commit()
    flash("Тип відділу видалено", "success")
    return redirect(url_for("settings.department_types"))


# ── Geo edit / delete ─────────────────────────────────────────────────────

@settings_bp.route("/geos/<int:item_id>/edit", methods=["POST"])
def edit_geo(item_id):
    item = Geo.query.get_or_404(item_id)
    name = request.form.get("name", "").strip()
    code = request.form.get("code", "").strip()
    if not name:
        flash("Назва обов'язкова", "danger")
    else:
        item.name = name
        item.code = code or None
        db.session.commit()
        flash("GEO оновлено", "success")
    return redirect(url_for("settings.geos"))


@settings_bp.route("/geos/<int:item_id>/delete", methods=["POST"])
def delete_geo(item_id):
    item = Geo.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    flash("GEO видалено", "success")
    return redirect(url_for("settings.geos"))


# ── GeoLocation edit / delete ─────────────────────────────────────────────

@settings_bp.route("/geo-locations/<int:item_id>/delete", methods=["POST"])
def delete_geo_location(item_id):
    item = GeoLocation.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    flash("Локацію видалено", "success")
    return redirect(url_for("settings.geo_locations"))


# ── Tag edit / delete ─────────────────────────────────────────────────────

@settings_bp.route("/tags/<int:item_id>/edit", methods=["POST"])
def edit_tag(item_id):
    item = Tag.query.get_or_404(item_id)
    name = request.form.get("name", "").strip()
    if not name:
        flash("Назва обов'язкова", "danger")
    else:
        item.name = name
        db.session.commit()
        flash("Тег оновлено", "success")
    return redirect(url_for("settings.tags"))


@settings_bp.route("/tags/<int:item_id>/delete", methods=["POST"])
def delete_tag(item_id):
    item = Tag.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    flash("Тег видалено", "success")
    return redirect(url_for("settings.tags"))


@settings_bp.route("/admin-users")
def admin_users():
    items = AdminUser.query.order_by(AdminUser.username.asc()).all()
    return render_template("settings/admin_users.html", items=items)


@settings_bp.route("/admin-users/create", methods=["GET", "POST"])
def create_admin_user():
    departments = Department.query.filter_by(is_archived=False).order_by(Department.name.asc()).all()
    people = Person.query.filter_by(is_archived=False).order_by(Person.full_name.asc()).all()

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        admin_role = request.form.get("admin_role", "").strip()
        department_id = request.form.get("department_id", type=int)
        person_id = request.form.get("person_id", type=int)
        is_active_user = request.form.get("is_active_user") == "on"

        if not username or not password or not admin_role:
            flash("Username, пароль та роль обов'язкові", "danger")
            return render_template("settings/admin_user_create.html", departments=departments, people=people)

        existing = AdminUser.query.filter_by(username=username).first()
        if existing:
            flash("Користувач з таким username вже існує", "danger")
            return render_template("settings/admin_user_create.html", departments=departments, people=people)

        if person_id:
            existing_person_user = AdminUser.query.filter_by(person_id=person_id).first()
            if existing_person_user:
                flash("Ця людина вже прив'язана до іншого адмін-користувача", "danger")
                return render_template("settings/admin_user_create.html", departments=departments, people=people)

        user = AdminUser(
            username=username,
            password_hash=generate_password_hash(password, method="pbkdf2:sha256"),
            admin_role=admin_role,
            department_id=department_id or None,
            person_id=person_id or None,
            is_active_user=is_active_user,
        )

        db.session.add(user)
        db.session.commit()

        log_action(
            entity_type="admin_user",
            entity_id=user.id,
            action="create",
            new_data={
                "username": user.username,
                "admin_role": user.admin_role,
                "department_id": user.department_id,
                "person_id": user.person_id,
                "is_active_user": user.is_active_user,
            },
        )
        db.session.commit()

        flash("Користувача адмінки створено", "success")
        return redirect(url_for("settings.admin_users"))

    return render_template("settings/admin_user_create.html", departments=departments, people=people)


@settings_bp.route("/admin-users/<int:user_id>/edit", methods=["GET", "POST"])
def edit_admin_user(user_id):
    user = AdminUser.query.get_or_404(user_id)
    departments = Department.query.filter_by(is_archived=False).order_by(Department.name.asc()).all()
    people = Person.query.filter_by(is_archived=False).order_by(Person.full_name.asc()).all()

    if request.method == "POST":
        old_data = {
            "username": user.username,
            "admin_role": user.admin_role,
            "department_id": user.department_id,
            "person_id": user.person_id,
            "is_active_user": user.is_active_user,
        }

        username = request.form.get("username", "").strip()
        admin_role = request.form.get("admin_role", "").strip()
        department_id = request.form.get("department_id", type=int)
        person_id = request.form.get("person_id", type=int)
        is_active_user = request.form.get("is_active_user") == "on"

        if not username or not admin_role:
            flash("Username та роль обов'язкові", "danger")
            return render_template("settings/admin_user_edit.html", user=user, departments=departments, people=people)

        existing = AdminUser.query.filter(
            AdminUser.username == username,
            AdminUser.id != user.id,
        ).first()

        if existing:
            flash("Користувач з таким username вже існує", "danger")
            return render_template("settings/admin_user_edit.html", user=user, departments=departments, people=people)

        if person_id:
            existing_person_user = AdminUser.query.filter(
                AdminUser.person_id == person_id,
                AdminUser.id != user.id,
            ).first()

            if existing_person_user:
                flash("Ця людина вже прив'язана до іншого адмін-користувача", "danger")
                return render_template("settings/admin_user_edit.html", user=user, departments=departments, people=people)

        user.username = username
        user.admin_role = admin_role
        user.department_id = department_id or None
        user.person_id = person_id or None
        user.is_active_user = is_active_user

        db.session.commit()

        log_action(
            entity_type="admin_user",
            entity_id=user.id,
            action="update",
            old_data=old_data,
            new_data={
                "username": user.username,
                "admin_role": user.admin_role,
                "department_id": user.department_id,
                "person_id": user.person_id,
                "is_active_user": user.is_active_user,
            },
        )
        db.session.commit()

        flash("Користувача адмінки оновлено", "success")
        return redirect(url_for("settings.admin_users"))

    return render_template("settings/admin_user_edit.html", user=user, departments=departments, people=people)


@settings_bp.route("/admin-users/<int:user_id>/reset-password", methods=["POST"])
def reset_admin_user_password(user_id):
    user = AdminUser.query.get_or_404(user_id)
    password = request.form.get("password", "").strip()

    if not password:
        flash("Вкажіть новий пароль", "danger")
        return redirect(url_for("settings.edit_admin_user", user_id=user.id))

    user.password_hash = generate_password_hash(password, method="pbkdf2:sha256")
    db.session.commit()

    log_action(
        entity_type="admin_user",
        entity_id=user.id,
        action="reset_password",
        new_data={
            "username": user.username,
        },
    )
    db.session.commit()

    flash("Пароль оновлено", "success")
    return redirect(url_for("settings.edit_admin_user", user_id=user.id))


@settings_bp.route("/admin-users/<int:user_id>/toggle-active", methods=["POST"])
def toggle_admin_user_active(user_id):
    user = AdminUser.query.get_or_404(user_id)

    if user.id == current_user.id:
        flash("Не можна деактивувати самого себе", "danger")
        return redirect(url_for("settings.admin_users"))

    old_data = {
        "is_active_user": user.is_active_user,
    }

    user.is_active_user = not user.is_active_user
    db.session.commit()

    log_action(
        entity_type="admin_user",
        entity_id=user.id,
        action="toggle_active",
        old_data=old_data,
        new_data={
            "username": user.username,
            "is_active_user": user.is_active_user,
        },
    )
    db.session.commit()

    flash("Статус користувача оновлено", "success")
    return redirect(url_for("settings.admin_users"))