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

    # Additional departments a scoped role (e.g. Operation) is attached to.
    # The effective scope is the union of `department_id` and every linked
    # department, each expanded down its sub-department tree.
    scoped_department_links = db.relationship(
        "AdminUserDepartment",
        back_populates="admin_user",
        cascade="all, delete-orphan",
    )

    @property
    def scoped_department_ids(self):
        """All root department ids this user is scoped to (primary + extra)."""
        ids = set()
        if self.department_id:
            ids.add(self.department_id)
        for link in self.scoped_department_links:
            if link.department_id:
                ids.add(link.department_id)
        return ids

    @property
    def is_active(self):
        return self.is_active_user

    def get_id(self):
        return str(self.id)


class AdminUserDepartment(db.Model):
    """Many-to-many: a scoped admin user attached to several departments."""

    __tablename__ = "admin_user_departments"

    id = db.Column(db.Integer, primary_key=True)
    admin_user_id = db.Column(db.Integer, db.ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)

    admin_user = db.relationship("AdminUser", back_populates="scoped_department_links")
    department = db.relationship("Department")

    __table_args__ = (
        db.UniqueConstraint("admin_user_id", "department_id", name="uq_admin_user_department"),
    )


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
