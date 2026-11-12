"""Grade access presets: one place to define the CEILING of what each grade
(junior/middle/senior) may see. Applying a preset to people can only turn
toggles OFF (never re-add what a TL turned off). A TL turning a toggle ON that
the preset has OFF needs admin approval."""

from app.extensions import db
from app.models import GradeAccessPreset, Person
from app.utils.visibility import normalize_visibility


GRADES = ["junior", "middle", "senior"]
GRADE_LABELS = {"junior": "Junior", "middle": "Middle", "senior": "Senior"}

# The on/off visibility toggles a preset carries (mirrors the person card).
PRESET_BOOL_FIELDS = [
    "map_access",
    "map_show_connections",
    "card_show_short_description",
    "card_show_full_description",
    "card_show_relations",
    "show_department_people_count",
    "show_department_leads",
    "show_department_lead_positions",
    "show_department_people",
    "show_department_people_positions",
    "show_department_people_responsibility",
    "show_department_email",
    "show_department_telegram",
    "show_department_chat_link",
    "show_lead_contacts",
    "show_lead_email",
    "show_lead_telegram",
    "show_lead_reddy",
    "show_people_contacts",
    "show_people_email",
    "show_people_telegram",
    "show_people_reddy",
]

# Seed defaults (ceiling). Junior = tighter, senior = everything visible.
_SEED = {
    "junior": {
        "map_access": True, "map_show_connections": True,
        "card_show_short_description": True, "card_show_full_description": False,
        "card_show_relations": True, "show_department_people_count": True,
        "show_department_leads": True, "show_department_lead_positions": True,
    },
    "middle": {f: True for f in PRESET_BOOL_FIELDS},
    "senior": {f: True for f in PRESET_BOOL_FIELDS},
}


def get_or_seed_presets():
    """Return {grade: GradeAccessPreset}, creating any missing with seed defaults."""
    presets = {p.grade: p for p in GradeAccessPreset.query.all()}
    created = False
    for grade in GRADES:
        if grade not in presets:
            preset = GradeAccessPreset(grade=grade)
            for field, value in _SEED.get(grade, {}).items():
                setattr(preset, field, value)
            db.session.add(preset)
            presets[grade] = preset
            created = True
    if created:
        db.session.commit()
    return presets


def preset_for_grade(grade):
    """The preset for a grade, or None. Seeds all presets on first use."""
    return get_or_seed_presets().get(grade)


def fields_exceeding_preset(preset, desired):
    """Toggles `desired` wants ON that the preset has OFF (above the ceiling).

    `desired` maps field -> bool. Returns the list of offending field names.
    """
    if preset is None:
        return []
    over = []
    for field in PRESET_BOOL_FIELDS:
        if desired.get(field) and not getattr(preset, field):
            over.append(field)
    return over


def apply_preset_to_person(person, preset):
    """Clamp a person down to the preset ceiling: a toggle stays ON only if BOTH
    the preset allows it AND the person already had it ON (preset AND person).
    Never re-adds what was turned off. Then normalize dependent toggles."""
    for field in PRESET_BOOL_FIELDS:
        new_value = bool(getattr(preset, field)) and bool(getattr(person, field))
        setattr(person, field, new_value)
    # Access level is retired — everyone is on the pass-through "limited".
    person.department_card_access = "limited"
    normalize_visibility(person)


def seed_person_from_preset(person, preset):
    """Start a brand-new person at the preset ceiling (preset values as-is)."""
    for field in PRESET_BOOL_FIELDS:
        setattr(person, field, bool(getattr(preset, field)))
    person.department_card_access = "limited"
    normalize_visibility(person)


def apply_preset_to_grade(grade, preset):
    """Clamp every non-archived person of that grade to the preset. Returns count."""
    people = Person.query.filter_by(is_archived=False, grade=grade).all()
    for person in people:
        apply_preset_to_person(person, preset)
    return len(people)
