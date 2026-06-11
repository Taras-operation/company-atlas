from datetime import datetime

from app.extensions import db


class DepartmentRelation(db.Model):
    __tablename__ = "department_relations"

    id = db.Column(db.Integer, primary_key=True)

    department_from_id = db.Column(
        db.Integer,
        db.ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
    )
    department_to_id = db.Column(
        db.Integer,
        db.ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
    )

    relation_type_id = db.Column(
        db.Integer,
        db.ForeignKey("relation_types.id", ondelete="SET NULL"),
    )

    # Visualization logic
    direction = db.Column(db.String(30), default="from_to", nullable=False)
    # from_to / to_from / bidirectional

    strength = db.Column(db.String(30), default="medium", nullable=False)
    # low / medium / high

    is_bidirectional = db.Column(db.Boolean, default=False, nullable=False)
    show_on_map = db.Column(db.Boolean, default=True, nullable=False)
    is_critical = db.Column(db.Boolean, default=False, nullable=False)

    status = db.Column(db.String(30), default="active", nullable=False)
    # active / draft / paused

    short_description = db.Column(db.Text)
    full_description = db.Column(db.Text)
    notes = db.Column(db.Text)

    responsible_person_from_id = db.Column(
        db.Integer,
        db.ForeignKey("people.id", ondelete="SET NULL"),
    )
    responsible_person_to_id = db.Column(
        db.Integer,
        db.ForeignKey("people.id", ondelete="SET NULL"),
    )

    created_by = db.Column(
        db.Integer,
        db.ForeignKey("admin_users.id", ondelete="SET NULL"),
    )
    updated_by = db.Column(
        db.Integer,
        db.ForeignKey("admin_users.id", ondelete="SET NULL"),
    )

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    is_archived = db.Column(db.Boolean, default=False, nullable=False)

    department_from = db.relationship(
        "Department",
        foreign_keys=[department_from_id],
        back_populates="outgoing_relations",
    )

    department_to = db.relationship(
        "Department",
        foreign_keys=[department_to_id],
        back_populates="incoming_relations",
    )

    relation_type = db.relationship(
        "RelationType",
        back_populates="relations",
    )

    created_by_user = db.relationship(
        "AdminUser",
        foreign_keys=[created_by],
        viewonly=True,
    )

    updated_by_user = db.relationship(
        "AdminUser",
        foreign_keys=[updated_by],
        viewonly=True,
    )

    responsible_person_from = db.relationship(
        "Person",
        foreign_keys=[responsible_person_from_id],
        back_populates="outgoing_relation_responsibilities",
    )

    responsible_person_to = db.relationship(
        "Person",
        foreign_keys=[responsible_person_to_id],
        back_populates="incoming_relation_responsibilities",
    )

    __table_args__ = (
        db.CheckConstraint(
            "department_from_id != department_to_id",
            name="ck_relation_departments_different",
        ),
    )