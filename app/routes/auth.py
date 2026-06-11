from datetime import datetime

from flask import Blueprint, flash, jsonify, redirect, render_template, request, session, url_for
from flask_login import current_user, login_user, logout_user
from werkzeug.security import check_password_hash

from app.extensions import db
from app.models import AdminUser, ViewerUser


auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("dashboard.index"))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = AdminUser.query.filter_by(username=username).first()

        if not user or not check_password_hash(user.password_hash, password):
            flash("Невірний логін або пароль", "danger")
            return render_template("auth/login.html")

        login_user(user)
        user.last_login_at = datetime.utcnow()
        db.session.commit()
        return redirect(url_for("dashboard.index"))

    return render_template("auth/login.html")


@auth_bp.route("/api/visualization-login", methods=["POST"])
def visualization_login():
    existing_visualization_user_id = session.get("visualization_user_id")

    if existing_visualization_user_id:
        return jsonify({
            "success": True,
            "message": "Already authenticated",
        })

    payload = request.get_json(silent=True) or {}

    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))

    if not username or not password:
        return jsonify({
            "success": False,
            "message": "Username and password are required",
        }), 400

    user = ViewerUser.query.filter_by(username=username).first()

    if not user or not user.is_active or not check_password_hash(user.password_hash, password):
        return jsonify({
            "success": False,
            "message": "Invalid username or password",
        }), 401

    session["visualization_user_id"] = user.id
    user.last_login_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        "success": True,
        "message": "Authenticated",
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.person.full_name if getattr(user, "person", None) else user.username,
            "role": "viewer",
        },
    })


@auth_bp.route("/api/visualization-logout", methods=["POST"])
def visualization_logout():
    session.pop("visualization_user_id", None)

    return jsonify({
        "success": True,
        "message": "Logged out",
    })


@auth_bp.route("/logout")
def logout():
    logout_user()
    return redirect(url_for("auth.login"))
