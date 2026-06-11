from datetime import datetime

from app.extensions import db


class Person(db.Model):
    __tablename__ = "people"

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(150), nullable=False, index=True)
    position = db.Column(db.String(150))
    grade = db.Column(db.String(30), default="junior", nullable=False)
    avatar = db.Column(db.String(500))
    short_description = db.Column(db.Text)
    responsibility_area = db.Column(db.Text)

    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="SET NULL"))
    manager_id = db.Column(db.Integer, db.ForeignKey("people.id", ondelete="SET NULL"))

    email = db.Column(db.Text)  # may hold multiple emails (newline-separated)
    telegram = db.Column(db.String(255))
    phone = db.Column(db.String(100))
    notes = db.Column(db.Text)

    # Visibility: map
    map_access = db.Column(db.Boolean, default=True, nullable=False)
    map_show_connections = db.Column(db.Boolean, default=True, nullable=False)

    brand_scope = db.Column(db.String(20), default="all", nullable=False)
    geo_scope = db.Column(db.String(20), default="all", nullable=False)
    department_scope = db.Column(db.String(20), default="all", nullable=False)

    # Department card
    department_card_access = db.Column(db.String(30), default="limited", nullable=False)

    card_show_short_description = db.Column(db.Boolean, default=True, nullable=False)
    card_show_full_description = db.Column(db.Boolean, default=False, nullable=False)
    card_show_relations = db.Column(db.Boolean, default=True, nullable=False)

    # Department/team visibility
    show_department_people_count = db.Column(db.Boolean, default=True, nullable=False)

    show_department_leads = db.Column(db.Boolean, default=True, nullable=False)
    show_department_lead_positions = db.Column(db.Boolean, default=True, nullable=False)

    show_department_people = db.Column(db.Boolean, default=False, nullable=False)
    show_department_people_positions = db.Column(db.Boolean, default=True, nullable=False)
    show_department_people_responsibility = db.Column(db.Boolean, default=False, nullable=False)

    # Department contacts
    show_department_email = db.Column(db.Boolean, default=False, nullable=False)
    show_department_telegram = db.Column(db.Boolean, default=False, nullable=False)
    show_department_chat_link = db.Column(db.Boolean, default=False, nullable=False)

    # Lead / TL contacts
    show_lead_contacts = db.Column(db.Boolean, default=False, nullable=False)
    show_lead_email = db.Column(db.Boolean, default=False, nullable=False)
    show_lead_telegram = db.Column(db.Boolean, default=False, nullable=False)
    show_lead_reddy = db.Column(db.Boolean, default=False, nullable=False)

    # People contacts
    show_people_contacts = db.Column(db.Boolean, default=False, nullable=False)
    show_people_email = db.Column(db.Boolean, default=False, nullable=False)
    show_people_telegram = db.Column(db.Boolean, default=False, nullable=False)
    show_people_reddy = db.Column(db.Boolean, default=False, nullable=False)

    created_by = db.Column(db.Integer, db.ForeignKey("admin_users.id", ondelete="SET NULL"))
    updated_by = db.Column(db.Integer, db.ForeignKey("admin_users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_archived = db.Column(db.Boolean, default=False, nullable=False)

    department = db.relationship("Department", back_populates="people")

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

    manager = db.relationship("Person", remote_side=[id], back_populates="subordinates")
    subordinates = db.relationship("Person", back_populates="manager")

    role_links = db.relationship("PersonRole", back_populates="person", cascade="all, delete-orphan")
    geo_location_links = db.relationship("PersonGeoLocation", back_populates="person", cascade="all, delete-orphan")
    tag_links = db.relationship("PersonTag", back_populates="person", cascade="all, delete-orphan")
    lead_departments = db.relationship("DepartmentLead", back_populates="person", cascade="all, delete-orphan")

    visibility_brand_links = db.relationship(
        "PersonVisibilityBrand",
        back_populates="person",
        cascade="all, delete-orphan",
    )

    visibility_geo_links = db.relationship(
        "PersonVisibilityGeo",
        back_populates="person",
        cascade="all, delete-orphan",
    )

    visibility_department_links = db.relationship(
        "PersonVisibilityDepartment",
        back_populates="person",
        cascade="all, delete-orphan",
    )

    outgoing_relation_responsibilities = db.relationship(
        "DepartmentRelation",
        foreign_keys="DepartmentRelation.responsible_person_from_id",
        back_populates="responsible_person_from",
    )

    incoming_relation_responsibilities = db.relationship(
        "DepartmentRelation",
        foreign_keys="DepartmentRelation.responsible_person_to_id",
        back_populates="responsible_person_to",
    )

    admin_user = db.relationship(
        "AdminUser",
        back_populates="person",
        uselist=False,
        foreign_keys="AdminUser.person_id",
    )

    viewer_user = db.relationship(
        "ViewerUser",
        back_populates="person",
        uselist=False,
        cascade="all, delete-orphan",
    )


class PersonGeoLocation(db.Model):
    __tablename__ = "person_geo_locations"

    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.Integer, db.ForeignKey("people.id", ondelete="CASCADE"), nullable=False)
    geo_location_id = db.Column(db.Integer, db.ForeignKey("geo_locations.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    person = db.relationship("Person", back_populates="geo_location_links")
    geo_location = db.relationship("GeoLocation", back_populates="person_links")

    __table_args__ = (db.UniqueConstraint("person_id", "geo_location_id", name="uq_person_geo_location"),)


class PersonTag(db.Model):
    __tablename__ = "person_tags"

    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.Integer, db.ForeignKey("people.id", ondelete="CASCADE"), nullable=False)
    tag_id = db.Column(db.Integer, db.ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)

    person = db.relationship("Person", back_populates="tag_links")
    tag = db.relationship("Tag", back_populates="person_links")

    __table_args__ = (db.UniqueConstraint("person_id", "tag_id", name="uq_person_tag"),)


class PersonVisibilityBrand(db.Model):
    __tablename__ = "person_visibility_brands"

    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.Integer, db.ForeignKey("people.id", ondelete="CASCADE"), nullable=False)
    brand_id = db.Column(db.Integer, db.ForeignKey("brands.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    person = db.relationship("Person", back_populates="visibility_brand_links")
    brand = db.relationship("Brand")

    __table_args__ = (db.UniqueConstraint("person_id", "brand_id", name="uq_person_visibility_brand"),)


class PersonVisibilityGeo(db.Model):
    __tablename__ = "person_visibility_geos"

    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.Integer, db.ForeignKey("people.id", ondelete="CASCADE"), nullable=False)
    geo_id = db.Column(db.Integer, db.ForeignKey("geos.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    person = db.relationship("Person", back_populates="visibility_geo_links")
    geo = db.relationship("Geo")

    __table_args__ = (db.UniqueConstraint("person_id", "geo_id", name="uq_person_visibility_geo"),)


class PersonVisibilityDepartment(db.Model):
    __tablename__ = "person_visibility_departments"

    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.Integer, db.ForeignKey("people.id", ondelete="CASCADE"), nullable=False)
    department_id = db.Column(db.Integer, db.ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    person = db.relationship("Person", back_populates="visibility_department_links")
    department = db.relationship("Department")

    __table_args__ = (db.UniqueConstraint("person_id", "department_id", name="uq_person_visibility_department"),)