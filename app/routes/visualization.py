from flask import Blueprint, jsonify, render_template, request, session
from flask_login import current_user

from app.models import ViewerUser

from app.services.visualization_service import build_visualization_map_payload


visualization_bp = Blueprint(
    "visualization",
    __name__,
    url_prefix="/visualization"
)


@visualization_bp.route("/")
def visualization_index():
    return render_template("visualization/index.html")


@visualization_bp.route("/api/map")
def visualization_map_api():
    brand_id = request.args.get("brand_id", type=int)
    geo_id = request.args.get("geo_id", type=int)

    visualization_user_id = session.get("visualization_user_id")
    visualization_user = None

    if visualization_user_id:
        visualization_user = ViewerUser.query.get(visualization_user_id)

        if not visualization_user or not visualization_user.is_active:
            session.pop("visualization_user_id", None)
            visualization_user = None

    # Admin logged into the admin panel previews the full authorized map.
    is_admin_preview = current_user.is_authenticated
    public_view = visualization_user is None and not is_admin_preview

    payload = build_visualization_map_payload(
        brand_id=brand_id,
        geo_id=geo_id,
        public_view=public_view,
        viewer_user=visualization_user,
    )
    payload["mode"] = "public" if public_view else "private"
    payload["is_admin"] = bool(is_admin_preview)
    payload["admin_role"] = getattr(current_user, "admin_role", None) if is_admin_preview else None
    payload["can_edit_layout"] = bool(
        is_admin_preview and getattr(current_user, "admin_role", None) in ("super_admin", "admin")
    )

    payload["user"] = {
        "authenticated": visualization_user is not None,
        "id": visualization_user.id if visualization_user else None,
        "username": visualization_user.username if visualization_user else None,
        "display_name": visualization_user.person.full_name if visualization_user and getattr(visualization_user, "person", None) else None,
        "role": "viewer" if visualization_user else None,
        "person_id": visualization_user.person_id if visualization_user else None,
        "department_id": visualization_user.person.department_id if visualization_user and getattr(visualization_user, "person", None) else None,
    }

    return jsonify(payload)


def _can_edit_layout():
    return current_user.is_authenticated and getattr(current_user, "admin_role", None) in ("super_admin", "admin")


@visualization_bp.route("/api/layout/<layout_key>", methods=["GET"])
def get_layout(layout_key):
    from app.models import MapLayout
    import json

    row = MapLayout.query.filter_by(layout_key=layout_key).first()
    data = {}
    if row and row.data:
        try:
            data = json.loads(row.data)
        except (ValueError, TypeError):
            data = {}
    return jsonify({"ok": True, "layout_key": layout_key, "data": data})


@visualization_bp.route("/api/layout/<layout_key>", methods=["POST"])
def save_layout(layout_key):
    if not _can_edit_layout():
        return jsonify({"ok": False, "error": "forbidden"}), 403

    from app.extensions import db
    from app.models import MapLayout
    import json

    payload = request.get_json(silent=True) or {}
    data = payload.get("data", {})
    row = MapLayout.query.filter_by(layout_key=layout_key).first()
    if not row:
        row = MapLayout(layout_key=layout_key)
        db.session.add(row)
    row.data = json.dumps(data)
    db.session.commit()
    return jsonify({"ok": True})


@visualization_bp.route("/api/department-position", methods=["POST"])
def save_department_position():
    if not _can_edit_layout():
        return jsonify({"ok": False, "error": "forbidden"}), 403

    from app.extensions import db
    from app.models import Department

    data = request.get_json(silent=True) or {}
    dep = Department.query.get(data.get("department_id"))
    if not dep:
        return jsonify({"ok": False, "error": "not found"}), 404

    if data.get("reset"):
        dep.manual_position = False
        dep.map_x = None
        dep.map_y = None
    else:
        try:
            dep.map_x = float(data.get("map_x"))
            dep.map_y = float(data.get("map_y"))
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "bad coords"}), 400
        dep.manual_position = True

    db.session.commit()
    return jsonify({"ok": True, "manual_position": dep.manual_position, "map_x": dep.map_x, "map_y": dep.map_y})
