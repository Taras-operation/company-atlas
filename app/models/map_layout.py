from datetime import datetime

from app.extensions import db


class MapLayout(db.Model):
    """Stores admin-customized visualization geometry per layout mode.

    layout_key examples: "metro-geo", "metro-type", "orbit".
    data: JSON string with custom geometry, e.g.
      {
        "waypoints": { "<lineKey>": [{"x":..,"y":..}, ...] },
        "branches": [
          {"id": "...", "color": "...", "name": "...",
           "points": [{"x":..,"y":..}, ...], "stationIds": [..]}
        ]
      }
    """

    __tablename__ = "map_layouts"

    id = db.Column(db.Integer, primary_key=True)
    layout_key = db.Column(db.String(64), nullable=False, unique=True, index=True)
    data = db.Column(db.Text)  # JSON
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
