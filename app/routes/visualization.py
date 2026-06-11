from flask import Blueprint, jsonify, render_template, request, session

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

    public_view = visualization_user is None

    payload = build_visualization_map_payload(
        brand_id=brand_id,
        geo_id=geo_id,
        public_view=public_view,
        viewer_user=visualization_user,
    )
    payload["mode"] = "public" if public_view else "private"

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
