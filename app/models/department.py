from datetime import datetime

from app.extensions import db


class Department(db.Model):
    __tablename__ = "departments"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False, unique=True, index=True)
    short_description = db.Column(db.Text)
    full_description = db.Column(db.Text)
    functions = db.Column(db.Text)
    department_type_id = db.Column(db.Integer, db.ForeignKey("department_types.id", ondelete="SET NULL"))
    size_label = db.Column(db.String(50))
    email = db.Column(db.String(255))
    telegram = db.Column(db.String(255))
    chat_link = db.Column(db.String(500))
    notes = db.Column(db.Text)
    parent_department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="SET NULL"))
    created_by = db.Column(db.Integer, db.ForeignKey("admin_users.id", ondelete="SET NULL"))
    updated_by = db.Column(db.Integer, db.ForeignKey("admin_users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_archived = db.Column(db.Boolean, default=False, nullable=False)

    sort_order = db.Column(db.Integer, default=0)

    map_x = db.Column(db.Float)
    map_y = db.Column(db.Float)

    manual_position = db.Column(db.Boolean, default=False)

    department_type = db.relationship("DepartmentType", back_populates="departments")
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
    parent_department = db.relationship("Department", remote_side=[id], back_populates="child_departments")
    child_departments = db.relationship("Department", back_populates="parent_department")

    brand_links = db.relationship("DepartmentBrand", back_populates="department", cascade="all, delete-orphan")
    geo_links = db.relationship("DepartmentGeo", back_populates="department", cascade="all, delete-orphan")
    lead_links = db.relationship("DepartmentLead", back_populates="department", cascade="all, delete-orphan")
    tag_links = db.relationship("DepartmentTag", back_populates="department", cascade="all, delete-orphan")

    people = db.relationship("Person", back_populates="department")

    outgoing_relations = db.relationship(
        "DepartmentRelation",
        foreign_keys="DepartmentRelation.department_from_id",
        back_populates="department_from",
    )
    incoming_relations = db.relationship(
        "DepartmentRelation",
        foreign_keys="DepartmentRelation.department_to_id",
        back_populates="department_to",
    )

    def effective_leaders(self):
        """Own leaders + inherited leaders from parent department(s).

        Returns a list of dicts: {"person", "inherited" (bool), "source" (parent name or None)}.
        Deduped by person; own leaders take priority over inherited ones.
        """
        result = []
        seen = set()

        for link in self.lead_links:
            person = getattr(link, "person", None)
            if not person or person.id in seen:
                continue
            seen.add(person.id)
            result.append({"person": person, "inherited": False, "source": None})

        # Walk up the parent chain, inheriting any not-yet-seen leaders.
        parent = self.parent_department
        guard = 0
        while parent and guard < 10:
            guard += 1
            for link in parent.lead_links:
                person = getattr(link, "person", None)
                if not person or person.id in seen:
                    continue
                seen.add(person.id)
                result.append({"person": person, "inherited": True, "source": parent.name})
            parent = parent.parent_department

        return result


class DepartmentBrand(db.Model):
    __tablename__ = "department_brands"

    id = db.Column(db.Integer, primary_key=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    brand_id = db.Column(db.Integer, db.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)

    department = db.relationship("Department", back_populates="brand_links")
    brand = db.relationship("Brand", back_populates="department_links")

    __table_args__ = (db.UniqueConstraint("department_id", "brand_id", name="uq_department_brand"),)


class DepartmentGeo(db.Model):
    __tablename__ = "department_geos"

    id = db.Column(db.Integer, primary_key=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    geo_id = db.Column(db.Integer, db.ForeignKey("geos.id", ondelete="CASCADE"), nullable=False)

    department = db.relationship("Department", back_populates="geo_links")
    geo = db.relationship("Geo", back_populates="department_links")

    __table_args__ = (db.UniqueConstraint("department_id", "geo_id", name="uq_department_geo"),)


class DepartmentLead(db.Model):
    __tablename__ = "department_leads"

    id = db.Column(db.Integer, primary_key=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    person_id = db.Column(db.Integer, db.ForeignKey("people.id", ondelete="CASCADE"), nullable=False)
    lead_type = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    department = db.relationship("Department", back_populates="lead_links")
    person = db.relationship("Person", back_populates="lead_departments")

    __table_args__ = (db.UniqueConstraint("department_id", "person_id", "lead_type", name="uq_department_lead"),)


class DepartmentTag(db.Model):
    __tablename__ = "department_tags"

    id = db.Column(db.Integer, primary_key=True)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    tag_id = db.Column(db.Integer, db.ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)

    department = db.relationship("Department", back_populates="tag_links")
    tag = db.relationship("Tag", back_populates="department_links")

    __table_args__ = (db.UniqueConstraint("department_id", "tag_id", name="uq_department_tag"),)
