from __future__ import annotations

from flask_login import current_user

from app.extensions import db
from app.models import AuditLog


def log_action(entity_type: str, entity_id: int, action: str, old_data=None, new_data=None) -> None:
    user_id = current_user.id if getattr(current_user, "is_authenticated", False) else None
    log = AuditLog(
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        old_data=old_data,
        new_data=new_data,
    )
    db.session.add(log)
