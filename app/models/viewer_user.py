from datetime import datetime

from flask_login import UserMixin

from app.extensions import db


class ViewerUser(UserMixin, db.Model):
    __tablename__ = "viewer_users"

    id = db.Column(db.Integer, primary_key=True)

    username = db.Column(db.String(120), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    # Plain copy of the viewer password so an admin/TL can look it up and tell
    # the user (these are low-privilege, read-only visualization logins). Only
    # set for passwords created/changed after this was added; older ones are NULL.
    password_plain = db.Column(db.String(255))

    person_id = db.Column(
        db.Integer,
        db.ForeignKey("people.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    is_active_user = db.Column(db.Boolean, default=True, nullable=False)
    last_login_at = db.Column(db.DateTime)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    person = db.relationship(
        "Person",
        back_populates="viewer_user",
    )

    @property
    def is_active(self):
        return self.is_active_user

    def get_id(self):
        return f"viewer:{self.id}"