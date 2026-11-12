from datetime import datetime

from app.extensions import db


class GradeAccessPreset(db.Model):
    """A reusable visibility preset per grade (junior/middle/senior).

    Defines, in ONE place, the CEILING of what a person of that grade may see in
    the visualization (a set of on/off toggles). Applying it to people can only
    REMOVE what the preset hides (never re-add what a TL turned off); and a TL
    turning ON a toggle the preset has OFF needs admin approval (#grade-presets).

    There is no more "access level" concept — the toggles are the sole control.
    """

    __tablename__ = "grade_access_presets"

    id = db.Column(db.Integer, primary_key=True)
    grade = db.Column(db.String(20), nullable=False, unique=True, index=True)  # junior/middle/senior

    # Map axis
    map_access = db.Column(db.Boolean, default=True, nullable=False)
    map_show_connections = db.Column(db.Boolean, default=True, nullable=False)

    # Card content
    card_show_short_description = db.Column(db.Boolean, default=True, nullable=False)
    card_show_full_description = db.Column(db.Boolean, default=False, nullable=False)
    card_show_relations = db.Column(db.Boolean, default=True, nullable=False)

    # Department team / info
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

    # Lead contacts
    show_lead_contacts = db.Column(db.Boolean, default=False, nullable=False)
    show_lead_email = db.Column(db.Boolean, default=False, nullable=False)
    show_lead_telegram = db.Column(db.Boolean, default=False, nullable=False)
    show_lead_reddy = db.Column(db.Boolean, default=False, nullable=False)

    # People contacts
    show_people_contacts = db.Column(db.Boolean, default=False, nullable=False)
    show_people_email = db.Column(db.Boolean, default=False, nullable=False)
    show_people_telegram = db.Column(db.Boolean, default=False, nullable=False)
    show_people_reddy = db.Column(db.Boolean, default=False, nullable=False)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
