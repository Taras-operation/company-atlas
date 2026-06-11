from datetime import datetime

from app.extensions import db


class DepartmentType(db.Model):
    __tablename__ = "department_types"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True, index=True)
    description = db.Column(db.Text)
    color = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    departments = db.relationship("Department", back_populates="department_type")


class RelationType(db.Model):
    __tablename__ = "relation_types"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True, index=True)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    relations = db.relationship("DepartmentRelation", back_populates="relation_type")


class Brand(db.Model):
    __tablename__ = "brands"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True, index=True)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    department_links = db.relationship("DepartmentBrand", back_populates="brand", cascade="all, delete-orphan")


class Geo(db.Model):
    __tablename__ = "geos"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True, index=True)
    code = db.Column(db.String(50), unique=True)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    locations = db.relationship("GeoLocation", back_populates="geo", cascade="all, delete-orphan")
    department_links = db.relationship("DepartmentGeo", back_populates="geo", cascade="all, delete-orphan")


class GeoLocation(db.Model):
    __tablename__ = "geo_locations"

    id = db.Column(db.Integer, primary_key=True)
    geo_id = db.Column(db.Integer, db.ForeignKey("geos.id", ondelete="CASCADE"), nullable=False)
    name = db.Column(db.String(120), nullable=False, index=True)
    location_type = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    geo = db.relationship("Geo", back_populates="locations")
    person_links = db.relationship("PersonGeoLocation", back_populates="geo_location", cascade="all, delete-orphan")

    __table_args__ = (db.UniqueConstraint("geo_id", "name", name="uq_geo_location_geo_name"),)


class Tag(db.Model):
    __tablename__ = "tags"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True, index=True)
    tag_type = db.Column(db.String(50))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    department_links = db.relationship("DepartmentTag", back_populates="tag", cascade="all, delete-orphan")
    person_links = db.relationship("PersonTag", back_populates="tag", cascade="all, delete-orphan")
