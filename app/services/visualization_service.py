from app.models.department import Department
from app.models.relation import DepartmentRelation
from app.models.settings import Brand, DepartmentType, Geo
from app.utils import visibility as visibility_utils


DEFAULT_LINE_COLORS = [
    "#2563EB",  # blue
    "#16A34A",  # green
    "#F97316",  # orange
    "#9333EA",  # purple
    "#DC2626",  # red
    "#0891B2",  # cyan
    "#CA8A04",  # yellow
    "#DB2777",  # pink
]


def _get_type_color(department_type, index=0):
    """Return saved department type color or stable fallback color."""
    color = getattr(department_type, "color", None)
    if color:
        return color
    return DEFAULT_LINE_COLORS[index % len(DEFAULT_LINE_COLORS)]


def _serialize_department_type(department_type, index=0):
    return {
        "id": department_type.id,
        "name": department_type.name,
        "description": department_type.description,
        "color": _get_type_color(department_type, index),
    }


# --- Additional helpers ---



def _safe_getattr(obj, attr, default=None):
    return getattr(obj, attr, default) if obj is not None else default


# --- Relation normalization helpers ---

def _normalize_relation_strength(value):
    normalized = (value or "middle").strip().lower()

    if normalized in {"high", "hige", "critical", "strong", "важная", "высокая"}:
        return "high"
    if normalized in {"low", "weak", "низкая"}:
        return "low"
    if normalized in {"mid", "middle", "medium", "normal", "средняя"}:
        return "middle"

    return "middle"


def _normalize_relation_direction(value, is_bidirectional=False):
    normalized = (value or "forward").strip().lower()

    if is_bidirectional or normalized in {"bidirectional", "both", "two_way", "two-way", "двухсторонняя", "двусторонняя"}:
        return "bidirectional"
    if normalized in {"backward", "reverse", "incoming", "target_to_source", "назад", "входящая"}:
        return "backward"

    return "forward"



# --- Viewer Permissions Helpers ---

def _visibility_helper(name):
    helper = getattr(visibility_utils, name, None)
    return helper if callable(helper) else None


def _call_visibility_helper(name, *args, default=None, **kwargs):
    helper = _visibility_helper(name)
    if helper is None:
        return default
    return helper(*args, **kwargs)


def _viewer_access_source(viewer_user):
    if viewer_user is None:
        return None
    return getattr(viewer_user, "person", None) or viewer_user


def _visibility_bool(access_source, helper_names, attr_aliases, default=False):
    for helper_name in helper_names:
        value = _call_visibility_helper(helper_name, access_source, default=None)
        if value is not None:
            return bool(value)
    return _viewer_can(access_source, attr_aliases, default)


def _visibility_value(access_source, helper_names, attr_aliases, default=None):
    for helper_name in helper_names:
        value = _call_visibility_helper(helper_name, access_source, default=None)
        if value is not None:
            return value
    return _viewer_value(access_source, attr_aliases, default)

def _viewer_can(viewer_user, aliases, default=False):
    if viewer_user is None:
        return default

    for alias in aliases:
        if hasattr(viewer_user, alias):
            return bool(getattr(viewer_user, alias))

    return default


def _viewer_value(viewer_user, aliases, default=None):
    if viewer_user is None:
        return default

    for alias in aliases:
        if hasattr(viewer_user, alias):
            value = getattr(viewer_user, alias)
            if value is not None:
                return value

    return default


def _viewer_relation_ids(viewer_user, collection_aliases, id_aliases):
    ids = set()

    if viewer_user is None:
        return ids

    for collection_alias in collection_aliases:
        collection = getattr(viewer_user, collection_alias, None)

        if collection is None:
            continue

        try:
            items = list(collection)
        except TypeError:
            items = []

        for item in items:
            for id_alias in id_aliases:
                value = getattr(item, id_alias, None)

                if value is not None:
                    ids.add(value)
                    break

    return ids


def _build_viewer_access(viewer_user):
    if viewer_user is None:
        return None

    access_source = _viewer_access_source(viewer_user)

    return {
        "card_access": _visibility_value(
            access_source,
            ["get_department_card_access", "resolve_department_card_access"],
            ["department_card_access", "card_access", "access_level"],
            "limited",
        ),
        "can_view_relations": _visibility_bool(
            access_source,
            ["can_view_global_map_relations", "can_view_department_relations"],
            ["map_show_connections", "card_show_relations"],
            False,
        ),
        "can_view_short_description": _visibility_bool(
            access_source,
            ["can_view_department_short_description"],
            ["card_show_short_description"],
            True,
        ),
        "can_view_full_description": _visibility_bool(
            access_source,
            ["can_view_department_full_description"],
            ["card_show_full_description"],
            False,
        ),
        "can_view_related_departments": _visibility_bool(
            access_source,
            ["can_view_related_departments", "can_view_department_relations"],
            ["card_show_relations"],
            False,
        ),

        "can_view_department_email": _visibility_bool(
            access_source,
            ["can_view_department_email"],
            ["show_department_email"],
            False,
        ),
        "can_view_department_telegram": _visibility_bool(
            access_source,
            ["can_view_department_telegram"],
            ["show_department_telegram"],
            False,
        ),
        "can_view_department_chat_link": _visibility_bool(
            access_source,
            ["can_view_department_chat_link"],
            ["show_department_chat_link"],
            False,
        ),
        "can_view_department_notes": _visibility_bool(
            access_source,
            ["can_view_department_notes"],
            ["show_department_notes"],
            False,
        ),

        "can_view_people_count": _visibility_bool(
            access_source,
            ["can_view_department_people_count"],
            ["show_department_people_count"],
            False,
        ),

        "can_view_leaders": _visibility_bool(
            access_source,
            ["can_view_department_leads"],
            ["show_department_leads"],
            False,
        ),
        "can_view_leader_positions": _visibility_bool(
            access_source,
            ["can_view_department_lead_positions"],
            ["show_department_lead_positions"],
            False,
        ),
        "can_view_leader_responsibility": _visibility_bool(
            access_source,
            ["can_view_department_lead_responsibility"],
            ["show_department_lead_responsibility"],
            False,
        ),
        "can_view_leader_contacts": _visibility_bool(
            access_source,
            ["can_view_lead_contacts"],
            ["show_lead_contacts"],
            False,
        ),
        "can_view_leader_email": _visibility_bool(
            access_source,
            ["can_view_lead_email"],
            ["show_lead_email"],
            False,
        ),
        "can_view_leader_telegram": _visibility_bool(
            access_source,
            ["can_view_lead_telegram"],
            ["show_lead_telegram"],
            False,
        ),
        "can_view_leader_reddy": _visibility_bool(
            access_source,
            ["can_view_lead_reddy"],
            ["show_lead_reddy"],
            False,
        ),

        "can_view_people": _visibility_bool(
            access_source,
            ["can_view_department_people"],
            ["show_department_people"],
            False,
        ),
        "can_view_people_positions": _visibility_bool(
            access_source,
            ["can_view_department_people_positions"],
            ["show_department_people_positions"],
            False,
        ),
        "can_view_people_responsibility": _visibility_bool(
            access_source,
            ["can_view_department_people_responsibility"],
            ["show_department_people_responsibility"],
            False,
        ),
        "can_view_people_contacts": _visibility_bool(
            access_source,
            ["can_view_people_contacts"],
            ["show_people_contacts"],
            False,
        ),
        "can_view_people_email": _visibility_bool(
            access_source,
            ["can_view_people_email"],
            ["show_people_email"],
            False,
        ),
        "can_view_people_telegram": _visibility_bool(
            access_source,
            ["can_view_people_telegram"],
            ["show_people_telegram"],
            False,
        ),
        "can_view_people_reddy": _visibility_bool(
            access_source,
            ["can_view_people_reddy"],
            ["show_people_reddy"],
            False,
        ),

        "brand_ids": list(_viewer_relation_ids(
            access_source,
            ["visibility_brand_links"],
            ["brand_id", "id"],
        )),
        "geo_ids": list(_viewer_relation_ids(
            access_source,
            ["visibility_geo_links"],
            ["geo_id", "id"],
        )),
        "department_ids": list(_viewer_relation_ids(
            access_source,
            ["visibility_department_links"],
            ["department_id", "id"],
        )),
    }


def _sanitize_user_payload(user_payload, viewer_access, scope):
    if not user_payload or viewer_access is None:
        return user_payload

    result = dict(user_payload)
    can_view_contacts = bool(viewer_access.get(f"can_view_{scope}_contacts", False))
    can_view_email = can_view_contacts and bool(viewer_access.get(f"can_view_{scope}_email", False))
    can_view_telegram = can_view_contacts and bool(viewer_access.get(f"can_view_{scope}_telegram", False))
    can_view_reddy = can_view_contacts and bool(viewer_access.get(f"can_view_{scope}_reddy", False))
    can_view_positions = bool(viewer_access.get(f"can_view_{scope}_positions", False))
    can_view_responsibility = bool(viewer_access.get(f"can_view_{scope}_responsibility", False))

    if not can_view_email:
        result["email"] = None
    if not can_view_telegram:
        result["telegram"] = None
    if not can_view_reddy:
        result["phone"] = None

    if not can_view_positions:
        result["position"] = None
        result["role"] = None
        result["grade"] = None

    if not can_view_responsibility:
        result["responsibility_area"] = None
        result["notes"] = None

    return result


def _sanitize_person_payload(item, viewer_access, scope):
    if not item or viewer_access is None:
        return item

    result = dict(item)
    result["user"] = _sanitize_user_payload(result.get("user"), viewer_access, scope)

    if not viewer_access.get(f"can_view_{scope}_positions", False):
        result["position"] = None
        result["title"] = None
        if scope != "leader":
            result["lead_type"] = None

    if not viewer_access.get(f"can_view_{scope}_responsibility", False):
        result["responsibility_area"] = None
        result["notes"] = None

    return result


def _department_matches_viewer_access(department, viewer_access, viewer_user=None):
    if viewer_access is None:
        return True

    for helper_name in [
        "is_department_visible",
        "can_view_department",
        "department_matches_visibility_scope",
    ]:
        value = _call_visibility_helper(helper_name, _viewer_access_source(viewer_user), department, default=None)
        if value is not None:
            return bool(value)

    allowed_department_ids = viewer_access.get("department_ids") or set()
    allowed_brand_ids = viewer_access.get("brand_ids") or set()
    allowed_geo_ids = viewer_access.get("geo_ids") or set()

    if not allowed_department_ids and not allowed_brand_ids and not allowed_geo_ids:
        return True

    if department.id in allowed_department_ids:
        return True

    department_brand_ids = {getattr(link, "brand_id", None) for link in (department.brand_links or [])}
    department_geo_ids = {getattr(link, "geo_id", None) for link in (department.geo_links or [])}
    department_brand_ids.discard(None)
    department_geo_ids.discard(None)

    if allowed_brand_ids and department_brand_ids.intersection(allowed_brand_ids):
        return True

    if allowed_geo_ids and department_geo_ids.intersection(allowed_geo_ids):
        return True

    return False


def _serialize_user_like(user):
    if not user:
        return None

    department = _safe_getattr(user, "department")
    manager = _safe_getattr(user, "manager")
    lead_departments = list(_safe_getattr(user, "lead_departments", []) or [])
    subordinates = list(_safe_getattr(user, "subordinates", []) or [])

    first_name = _safe_getattr(user, "first_name")
    last_name = _safe_getattr(user, "last_name")
    full_name = _safe_getattr(user, "full_name")
    username = _safe_getattr(user, "username")
    email = _safe_getattr(user, "email")

    name = (
        _safe_getattr(user, "name")
        or full_name
        or " ".join(part for part in [first_name, last_name] if part)
        or username
        or email
    )

    manager_name = None
    if manager:
        manager_name = (
            _safe_getattr(manager, "name")
            or _safe_getattr(manager, "full_name")
            or _safe_getattr(manager, "username")
            or _safe_getattr(manager, "email")
        )

    is_manager = bool(lead_departments or subordinates)

    return {
        "id": _safe_getattr(user, "id"),
        "name": name,
        "full_name": full_name,
        "first_name": first_name,
        "last_name": last_name,
        "username": username,
        "email": email,
        "telegram": _safe_getattr(user, "telegram") or _safe_getattr(user, "tg_nick") or _safe_getattr(user, "telegram_username"),
        "phone": _safe_getattr(user, "phone") or _safe_getattr(user, "reddy") or _safe_getattr(user, "ready"),
        "position": _safe_getattr(user, "position") or _safe_getattr(user, "title"),
        "grade": _safe_getattr(user, "grade"),
        "short_description": _safe_getattr(user, "short_description"),
        "responsibility_area": _safe_getattr(user, "responsibility_area"),
        "department_id": _safe_getattr(user, "department_id"),
        "department_name": _safe_getattr(department, "name"),
        "manager_id": _safe_getattr(user, "manager_id"),
        "manager_name": manager_name,
        "is_manager": is_manager,
        "manager_status": "Так" if is_manager else "Ні",
        "lead_departments": [
            {
                "id": _safe_getattr(_safe_getattr(link, "department"), "id"),
                "name": _safe_getattr(_safe_getattr(link, "department"), "name"),
                "lead_type": _safe_getattr(link, "lead_type"),
            }
            for link in lead_departments
        ],
        "notes": _safe_getattr(user, "notes"),
        "role": _safe_getattr(user, "role") or _safe_getattr(user, "position"),
        "is_active": not bool(_safe_getattr(user, "is_archived", False)),
    }


def _get_first_existing_collection(obj, names):
    for name in names:
        value = getattr(obj, name, None)
        if value is None:
            continue
        try:
            return list(value)
        except TypeError:
            return value or []
    return []


def _serialize_leader_link(link):
    user = (
        _safe_getattr(link, "person")
        or _safe_getattr(link, "user")
        or _safe_getattr(link, "leader")
        or _safe_getattr(link, "employee")
        or link
    )

    return {
        "id": _safe_getattr(link, "id"),
        "lead_type": (
            _safe_getattr(link, "lead_type")
            or _safe_getattr(link, "leader_type")
            or _safe_getattr(link, "role")
            or _safe_getattr(link, "type")
            or _safe_getattr(user, "role")
            or _safe_getattr(user, "position")
        ),
        "title": _safe_getattr(link, "title") or _safe_getattr(user, "title") or _safe_getattr(user, "position"),
        "notes": _safe_getattr(link, "notes"),
        "department_name": _safe_getattr(_safe_getattr(user, "department"), "name"),
        "responsibility_area": _safe_getattr(user, "responsibility_area"),
        "manager_status": "Так" if list(_safe_getattr(user, "lead_departments", []) or []) else "Ні",
        "user": _serialize_user_like(user),
    }


def _serialize_person_link(link):
    user = (
        _safe_getattr(link, "person")
        or _safe_getattr(link, "user")
        or _safe_getattr(link, "employee")
        or _safe_getattr(link, "member")
        or link
    )

    return {
        "id": _safe_getattr(link, "id"),
        "position": (
            _safe_getattr(link, "position")
            or _safe_getattr(link, "title")
            or _safe_getattr(link, "role")
            or _safe_getattr(link, "person_role")
            or _safe_getattr(user, "position")
            or _safe_getattr(user, "title")
            or _safe_getattr(user, "role")
        ),
        "notes": _safe_getattr(link, "notes"),
        "department_name": _safe_getattr(_safe_getattr(user, "department"), "name"),
        "responsibility_area": _safe_getattr(user, "responsibility_area"),
        "manager_status": "Так" if list(_safe_getattr(user, "lead_departments", []) or []) else "Ні",
        "user": _serialize_user_like(user),
    }


def _serialize_child_department(department):
    return {
        "id": department.id,
        "name": department.name,
        "short_description": department.short_description,
        "department_type_name": department.department_type.name if department.department_type else "Без типу",
        "is_archived": department.is_archived,
    }


def _serialize_tag_link(link):
    tag = _safe_getattr(link, "tag") or link
    return {
        "id": _safe_getattr(tag, "id") or _safe_getattr(link, "tag_id"),
        "name": _safe_getattr(tag, "name") or _safe_getattr(link, "name"),
    }


def _serialize_department_station(department, public_view=False, viewer_access=None):
    department_type = department.department_type

    leader_links = _get_first_existing_collection(
        department,
        [
            "leader_links",
            "department_leaders",
            "leaders",
            "lead_links",
            "responsible_links",
            "head_links",
        ],
    )
    people_links = _get_first_existing_collection(
        department,
        [
            "people",
            "people_links",
            "department_people",
            "employees",
            "members",
            "users",
        ],
    )
    tag_links = _get_first_existing_collection(
        department,
        [
            "tag_links",
            "department_tags",
            "tags",
        ],
    )
    children_source = _get_first_existing_collection(
        department,
        [
            "child_departments",
            "children",
            "subdepartments",
            "sub_departments",
        ],
    )

    children = [
        child
        for child in children_source
        if not getattr(child, "is_archived", False)
    ]

    if public_view:
        return {
            "id": department.id,
            "name": department.name,
            "short_description": department.short_description,
            "full_description": None,
            "functions": None,
            "department_code": getattr(department, "code", None),
            "status": None,
            "headcount": None,
            "size_label": department.size_label,
            "email": None,
            "telegram": None,
            "chat_link": None,
            "notes": None,
            "department_type_id": department.department_type_id,
            "department_type_name": department_type.name if department_type else "Без типу",
            "parent_department_id": department.parent_department_id,
            "parent_department_name": department.parent_department.name if department.parent_department else None,
            "sort_order": getattr(department, "sort_order", 0) or 0,
            "map_x": getattr(department, "map_x", None),
            "map_y": getattr(department, "map_y", None),
            "manual_position": bool(getattr(department, "manual_position", False)),
            "created_at": None,
            "updated_at": None,
            "created_by": None,
            "updated_by": None,
            "brand_ids": [link.brand_id for link in department.brand_links],
            "brand_names": [link.brand.name for link in department.brand_links if link.brand],
            "brands": [
                {"id": link.brand_id, "name": link.brand.name}
                for link in department.brand_links
                if link.brand
            ],
            "geo_ids": [link.geo_id for link in department.geo_links],
            "geo_names": [link.geo.name for link in department.geo_links if link.geo],
            "geos": [
                {"id": link.geo_id, "name": link.geo.name}
                for link in department.geo_links
                if link.geo
            ],
            "tag_ids": [],
            "tags": [],
            "has_children": bool(children),
            "children": [_serialize_child_department(child) for child in children],
            "leaders": [],
            "people": [],
            "contacts": {
                "email": None,
                "telegram": None,
                "chat_link": None,
                "notes": None,
            },
            "is_public_limited": True,
        }

    return {
        "id": department.id,
        "name": department.name,
        "short_description": department.short_description if viewer_access is None or viewer_access.get("can_view_short_description") else None,
        "full_description": department.full_description if viewer_access is None or viewer_access.get("can_view_full_description") else None,
        "functions": department.functions if viewer_access is None or viewer_access.get("can_view_full_description") else None,
        "department_code": getattr(department, "code", None),
        "status": getattr(department, "status", None),
        "headcount": getattr(department, "headcount", None) if viewer_access is None or viewer_access.get("can_view_people_count") else None,
        "size_label": department.size_label,
        "email": department.email if viewer_access is None or viewer_access.get("can_view_department_email") else None,
        "telegram": department.telegram if viewer_access is None or viewer_access.get("can_view_department_telegram") else None,
        "chat_link": department.chat_link if viewer_access is None or viewer_access.get("can_view_department_chat_link") else None,
        "notes": department.notes if viewer_access is None or viewer_access.get("can_view_department_notes") else None,
        "department_type_id": department.department_type_id,
        "department_type_name": department_type.name if department_type else "Без типу",
        "parent_department_id": department.parent_department_id,
        "parent_department_name": department.parent_department.name if department.parent_department else None,
        "sort_order": getattr(department, "sort_order", 0) or 0,
        "map_x": getattr(department, "map_x", None),
        "map_y": getattr(department, "map_y", None),
        "manual_position": bool(getattr(department, "manual_position", False)),
        "created_at": department.created_at.isoformat() if department.created_at else None,
        "updated_at": department.updated_at.isoformat() if department.updated_at else None,
        "created_by": department.created_by,
        "updated_by": department.updated_by,
        "brand_ids": [link.brand_id for link in department.brand_links],
        "brand_names": [link.brand.name for link in department.brand_links if link.brand],
        "brands": [
            {"id": link.brand_id, "name": link.brand.name}
            for link in department.brand_links
            if link.brand
        ],
        "geo_ids": [link.geo_id for link in department.geo_links],
        "geo_names": [link.geo.name for link in department.geo_links if link.geo],
        "geos": [
            {"id": link.geo_id, "name": link.geo.name}
            for link in department.geo_links
            if link.geo
        ],
        "tag_ids": [link.tag_id for link in tag_links if getattr(link, "tag_id", None)],
        "tags": [item for item in (_serialize_tag_link(link) for link in tag_links) if item.get("name")],
        "has_children": bool(children),
        "children": [_serialize_child_department(child) for child in children] if viewer_access is None or viewer_access.get("can_view_related_departments") else [],
        "leaders": [
            _sanitize_person_payload(item, viewer_access, "leader")
            for item in (_serialize_leader_link(link) for link in leader_links)
            if item and (viewer_access is None or viewer_access.get("can_view_leaders"))
        ],
        "people": [
            _sanitize_person_payload(item, viewer_access, "people")
            for item in (_serialize_person_link(link) for link in people_links)
            if item and (viewer_access is None or viewer_access.get("can_view_people"))
        ],
        "contacts": {
            "email": department.email if viewer_access is None or viewer_access.get("can_view_department_email") else None,
            "telegram": department.telegram if viewer_access is None or viewer_access.get("can_view_department_telegram") else None,
            "chat_link": department.chat_link if viewer_access is None or viewer_access.get("can_view_department_chat_link") else None,
            "notes": department.notes if viewer_access is None or viewer_access.get("can_view_department_notes") else None,
        },
        "viewer_permissions": viewer_access,
    }


def _serialize_relation(relation):
    relation_type = relation.relation_type
    source_department = _safe_getattr(relation, "department_from")
    target_department = _safe_getattr(relation, "department_to")
    strength = _normalize_relation_strength(relation.strength)
    direction = _normalize_relation_direction(relation.direction, relation.is_bidirectional)
    is_bidirectional = direction == "bidirectional"

    return {
        "id": relation.id,
        "source": relation.department_from_id,
        "target": relation.department_to_id,
        "source_department_id": relation.department_from_id,
        "target_department_id": relation.department_to_id,
        "source_department_name": _safe_getattr(source_department, "name"),
        "target_department_name": _safe_getattr(target_department, "name"),
        "source_parent_department_id": _safe_getattr(source_department, "parent_department_id"),
        "target_parent_department_id": _safe_getattr(target_department, "parent_department_id"),
        "source_parent_department_name": _safe_getattr(_safe_getattr(source_department, "parent_department"), "name"),
        "target_parent_department_name": _safe_getattr(_safe_getattr(target_department, "parent_department"), "name"),
        "direction": direction,
        "direction_label": "Двусторонняя" if is_bidirectional else "Исходящая" if direction == "forward" else "Входящая",
        "is_bidirectional": is_bidirectional,
        "strength": strength,
        "priority": strength,
        "is_high_priority": strength == "high",
        "is_middle_priority": strength == "middle",
        "is_low_priority": strength == "low",
        "is_critical": bool(relation.is_critical),
        "show_on_map": bool(relation.show_on_map),
        "status": relation.status,
        "short_description": relation.short_description,
        "full_description": relation.full_description,
        "relation_type_id": _safe_getattr(relation_type, "id"),
        "relation_type": _safe_getattr(relation_type, "name"),
        "relation_type_name": _safe_getattr(relation_type, "name"),
        "relation_type_color": _safe_getattr(relation_type, "color"),
    }


# Helper to build department-relation index
def _build_department_relation_index(relations):
    relation_index = {}

    for relation in relations:
        source_id = relation.get("source_department_id") or relation.get("source")
        target_id = relation.get("target_department_id") or relation.get("target")

        if source_id is None or target_id is None:
            continue

        source_item = dict(relation)
        source_item["connected_department_id"] = target_id
        source_item["connected_department_name"] = relation.get("target_department_name")
        source_item["relation_side"] = "source"
        relation_index.setdefault(source_id, []).append(source_item)

        if relation.get("is_bidirectional") or relation.get("direction") == "backward":
            target_item = dict(relation)
            target_item["connected_department_id"] = source_id
            target_item["connected_department_name"] = relation.get("source_department_name")
            target_item["relation_side"] = "target"
            relation_index.setdefault(target_id, []).append(target_item)

    return relation_index


def _serialize_filter_item(item):
    return {
        "id": item.id,
        "name": item.name,
    }


def build_visualization_map_payload(brand_id=None, geo_id=None, public_view=False, viewer_user=None):
    """
    Build normalized payload for Metro View.

    Metro logic:
    - department type = metro line
    - department = station
    - active map relations = interaction layer
    - brand and geo are filters
    """
    departments_query = Department.query.filter(Department.is_archived.is_(False))
    viewer_access = _build_viewer_access(viewer_user) if not public_view else None

    if brand_id:
        departments_query = departments_query.filter(
            Department.brand_links.any(brand_id=brand_id)
        )

    if geo_id:
        departments_query = departments_query.filter(
            Department.geo_links.any(geo_id=geo_id)
        )

    departments = departments_query.all()
    if viewer_access:
        departments = [
            department
            for department in departments
            if _department_matches_viewer_access(department, viewer_access, viewer_user=viewer_user)
        ]
    department_ids = {department.id for department in departments}

    department_types = DepartmentType.query.order_by(DepartmentType.name.asc()).all()
    type_index = {department_type.id: index for index, department_type in enumerate(department_types)}

    lines = []
    for department_type in department_types:
        stations = [
            department
            for department in departments
            if department.department_type_id == department_type.id
        ]
        stations.sort(key=lambda item: ((getattr(item, "sort_order", 0) or 0), item.created_at, item.id))

        if stations:
            lines.append({
                **_serialize_department_type(department_type, type_index.get(department_type.id, 0)),
                "stations": [_serialize_department_station(department, public_view=public_view, viewer_access=viewer_access) for department in stations],
            })

    no_type_stations = [department for department in departments if not department.department_type_id]
    no_type_stations.sort(key=lambda item: ((getattr(item, "sort_order", 0) or 0), item.created_at, item.id))
    if no_type_stations:
        lines.append({
            "id": None,
            "name": "Без типу",
            "description": None,
            "color": "#64748B",
            "stations": [_serialize_department_station(department, public_view=public_view, viewer_access=viewer_access) for department in no_type_stations],
        })

    relations = []
    department_relation_index = {}
    if department_ids and not public_view and (viewer_access is None or viewer_access.get("can_view_relations")):
        relations_query = DepartmentRelation.query.filter(
            DepartmentRelation.is_archived.is_(False),
            DepartmentRelation.status == "active",
            DepartmentRelation.show_on_map.is_(True),
            DepartmentRelation.department_from_id.in_(list(department_ids)),
            DepartmentRelation.department_to_id.in_(list(department_ids)),
        )
        relations = [_serialize_relation(relation) for relation in relations_query.all()]
        department_relation_index = _build_department_relation_index(relations)

    for line in lines:
        for station in line.get("stations", []):
            station_id = station.get("id")
            station["relations"] = department_relation_index.get(station_id, [])
            station["relation_count"] = len(station["relations"])

    return {
        "mode": "public" if public_view else "authorized",
        "lines": lines,
        "relations": relations,
        "filters": {
            "brands": [_serialize_filter_item(brand) for brand in Brand.query.order_by(Brand.name.asc()).all()],
            "geos": [_serialize_filter_item(geo) for geo in Geo.query.order_by(Geo.name.asc()).all()],
        },
        "legend": {
            "line_color": "Цвет линии = тип отдела",
            "station": "Станция = отдел",
            "relation_strength": "Толщина связи = сила взаимодействия",
        },
        "viewer_permissions": viewer_access,
    }