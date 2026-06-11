from flask_login import current_user

from app.extensions import db
from app.models import AuditLog


def log_action(entity_type, entity_id, action, old_data=None, new_data=None):
    db.session.add(
        AuditLog(
            user_id=current_user.id if current_user and current_user.is_authenticated else None,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            old_data=old_data,
            new_data=new_data,
        )
    )