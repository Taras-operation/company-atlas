from datetime import datetime

from flask_login import UserMixin

from app.extensions import db, login_manager


class AdminUser(UserMixin, db.Model):
    __tablename__ = "admin_users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    person_id = db.Column(db.Integer, db.ForeignKey("people.id", ondelete="SET NULL"), unique=True)
    admin_role = db.Column(db.String(50), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="SET NULL"))
    is_active_user = db.Column(db.Boolean, default=True, nullable=False)
    last_login_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    person = db.relationship(
        "Person",
        back_populates="admin_user",
        foreign_keys=[person_id],
    )
    scoped_department = db.relationship(
        "Department",
        foreign_keys=[department_id],
    )

    @property
    def is_active(self):
        return self.is_active_user

    def get_id(self):
        return str(self.id)


# VisualizationUser model
class VisualizationUser(db.Model):
    __tablename__ = "visualization_users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(120), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(160))
    person_id = db.Column(db.Integer, db.ForeignKey("people.id", ondelete="SET NULL"), unique=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="SET NULL"))
    access_role = db.Column(db.String(50), nullable=False, default="viewer")
    is_active_user = db.Column(db.Boolean, default=True, nullable=False)
    last_login_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    person = db.relationship(
        "Person",
        foreign_keys=[person_id],
    )
    scoped_department = db.relationship(
        "Department",
        foreign_keys=[department_id],
    )

    @property
    def is_active(self):
        return self.is_active_user


@login_manager.user_loader
def load_user(user_id):
    return AdminUser.query.get(int(user_id))
