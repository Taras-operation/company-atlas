from datetime import datetime

from app.extensions import db


class Role(db.Model):
    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, index=True)
    role_type = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text)
    level = db.Column(db.String(50))

    show_in_department_card = db.Column(db.Boolean, default=True, nullable=False)
    show_in_visualization = db.Column(db.Boolean, default=True, nullable=False)
    is_managerial = db.Column(db.Boolean, default=False, nullable=False)

    map_access = db.Column(db.Boolean, default=True, nullable=False)
    map_show_connections = db.Column(db.Boolean, default=True, nullable=False)

    brand_scope = db.Column(db.String(20), default="all", nullable=False)
    geo_scope = db.Column(db.String(20), default="all", nullable=False)
    department_scope = db.Column(db.String(20), default="all", nullable=False)

    department_card_access = db.Column(db.String(30), default="limited", nullable=False)

    card_show_short_description = db.Column(db.Boolean, default=True, nullable=False)
    card_show_full_description = db.Column(db.Boolean, default=False, nullable=False)
    card_show_functions = db.Column(db.Boolean, default=False, nullable=False)
    card_show_relations = db.Column(db.Boolean, default=True, nullable=False)
    card_show_processes = db.Column(db.Boolean, default=False, nullable=False)

    people_access = db.Column(db.Boolean, default=False, nullable=False)
    people_show_leads = db.Column(db.Boolean, default=True, nullable=False)
    people_show_positions = db.Column(db.Boolean, default=True, nullable=False)
    people_show_responsibility = db.Column(db.Boolean, default=False, nullable=False)

    contacts_access = db.Column(db.Boolean, default=False, nullable=False)
    contacts_show_email = db.Column(db.Boolean, default=False, nullable=False)
    contacts_show_telegram = db.Column(db.Boolean, default=False, nullable=False)
    contacts_show_reddy = db.Column(db.Boolean, default=False, nullable=False)
    contacts_show_chat_links = db.Column(db.Boolean, default=False, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_archived = db.Column(db.Boolean, default=False, nullable=False)

    person_links = db.relationship(
        "PersonRole",
        back_populates="role",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        db.UniqueConstraint("name", "role_type", name="uq_role_name_type"),
    )


class PersonRole(db.Model):
    __tablename__ = "person_roles"

    id = db.Column(db.Integer, primary_key=True)

    person_id = db.Column(
        db.Integer,
        db.ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )

    role_id = db.Column(
        db.Integer,
        db.ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    person = db.relationship("Person", back_populates="role_links")
    role = db.relationship("Role", back_populates="person_links")

    __table_args__ = (
        db.UniqueConstraint("person_id", "role_id", name="uq_person_role"),
    )


class VisibilityChangeRequest(db.Model):
    __tablename__ = "visibility_change_requests"

    id = db.Column(db.Integer, primary_key=True)

    person_id = db.Column(
        db.Integer,
        db.ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )

    requested_by_id = db.Column(
        db.Integer,
        db.ForeignKey("admin_users.id", ondelete="SET NULL"),
    )

    reviewed_by_id = db.Column(
        db.Integer,
        db.ForeignKey("admin_users.id", ondelete="SET NULL"),
    )

    status = db.Column(
        db.String(30),
        default="pending",
        nullable=False,
    )

    payload = db.Column(db.JSON, nullable=False)

    comment = db.Column(db.Text)
    review_comment = db.Column(db.Text)

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    reviewed_at = db.Column(db.DateTime)

    person = db.relationship("Person")

    requested_by = db.relationship(
        "AdminUser",
        foreign_keys=[requested_by_id],
    )

    reviewed_by = db.relationship(
        "AdminUser",
        foreign_keys=[reviewed_by_id],
    )