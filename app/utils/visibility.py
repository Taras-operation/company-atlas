

from typing import Iterable


HIDDEN_SCOPE = "none"
EXCLUDE_SCOPE = "selected"
FULL_SCOPE = "all"


# =========================================================
# NORMALIZATION
# =========================================================


def normalize_visibility(person):
    """
    Central visibility normalization.

    Cleans conflicting visibility settings before save.
    This function is the single source of truth
    for visualization permissions.
    """

    # -----------------------------------------------------
    # Global visualization disabled
    # -----------------------------------------------------

    if not person.map_access:
        _disable_all_visibility(person)
        return person

    # -----------------------------------------------------
    # Relations disabled globally
    # -----------------------------------------------------

    if not person.map_show_connections:
        person.card_show_relations = False

    # -----------------------------------------------------
    # Department card access presets
    # -----------------------------------------------------

    if person.department_card_access == "none":
        person.card_show_full_description = False
        person.card_show_relations = False

        person.show_department_people_count = False
        person.show_department_leads = False
        person.show_department_lead_positions = False
        person.show_department_people = False
        person.show_department_people_positions = False
        person.show_department_people_responsibility = False

        person.show_department_email = False
        person.show_department_telegram = False
        person.show_department_chat_link = False

        person.show_lead_contacts = False
        person.show_lead_email = False
        person.show_lead_telegram = False
        person.show_lead_reddy = False

        person.show_people_contacts = False
        person.show_people_email = False
        person.show_people_telegram = False
        person.show_people_reddy = False

    # -----------------------------------------------------
    # Leads disabled
    # -----------------------------------------------------

    if not person.show_department_leads:
        person.show_department_lead_positions = False

        person.show_lead_contacts = False
        person.show_lead_email = False
        person.show_lead_telegram = False
        person.show_lead_reddy = False

    # -----------------------------------------------------
    # Lead contacts disabled
    # -----------------------------------------------------

    if not person.show_lead_contacts:
        person.show_lead_email = False
        person.show_lead_telegram = False
        person.show_lead_reddy = False

    # -----------------------------------------------------
    # People disabled
    # -----------------------------------------------------

    if not person.show_department_people:
        person.show_department_people_positions = False
        person.show_department_people_responsibility = False

        person.show_people_contacts = False
        person.show_people_email = False
        person.show_people_telegram = False
        person.show_people_reddy = False

    # -----------------------------------------------------
    # People contacts disabled
    # -----------------------------------------------------

    if not person.show_people_contacts:
        person.show_people_email = False
        person.show_people_telegram = False
        person.show_people_reddy = False

    return person


# =========================================================
# SCOPES
# =========================================================


def is_brand_hidden(viewer, brand_id):
    return _is_hidden_by_scope(
        scope=viewer.brand_scope,
        selected_ids=[x.brand_id for x in viewer.visibility_brand_links],
        current_id=brand_id,
    )



def is_geo_hidden(viewer, geo_id):
    return _is_hidden_by_scope(
        scope=viewer.geo_scope,
        selected_ids=[x.geo_id for x in viewer.visibility_geo_links],
        current_id=geo_id,
    )



def is_department_hidden(viewer, department_id):
    return _is_hidden_by_scope(
        scope=viewer.department_scope,
        selected_ids=[x.department_id for x in viewer.visibility_department_links],
        current_id=department_id,
    )



def _is_hidden_by_scope(scope, selected_ids: Iterable[int], current_id):
    """
    Scope logic:

    all       -> visible everything
    selected  -> hide selected ids
    none      -> hide everything
    """

    if scope == FULL_SCOPE:
        return False

    if scope == HIDDEN_SCOPE:
        return True

    if scope == EXCLUDE_SCOPE:
        return current_id in selected_ids

    return False


# =========================================================
# HELPERS
# =========================================================


def can_open_lead_card(viewer):
    return bool(viewer.show_lead_contacts)



def can_view_people_contacts(viewer):
    return bool(
        viewer.show_department_people
        and viewer.show_people_contacts
    )



def can_view_lead_contacts(viewer):
    return bool(
        viewer.show_department_leads
        and viewer.show_lead_contacts
    )


# =========================================================
# INTERNAL
# =========================================================


def _disable_all_visibility(person):
    person.map_show_connections = False

    person.card_show_short_description = False
    person.card_show_full_description = False
    person.card_show_relations = False

    person.show_department_people_count = False
    person.show_department_leads = False
    person.show_department_lead_positions = False
    person.show_department_people = False
    person.show_department_people_positions = False
    person.show_department_people_responsibility = False

    person.show_department_email = False
    person.show_department_telegram = False
    person.show_department_chat_link = False

    person.show_lead_contacts = False
    person.show_lead_email = False
    person.show_lead_telegram = False
    person.show_lead_reddy = False

    person.show_people_contacts = False
    person.show_people_email = False
    person.show_people_telegram = False
    person.show_people_reddy = False