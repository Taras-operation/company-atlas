from flask import Flask

from app.config import Config
from app.extensions import db, login_manager, migrate


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    from app.models import (  # noqa: F401
        AdminUser,
        AuditLog,
        Brand,
        Department,
        DepartmentBrand,
        DepartmentGeo,
        DepartmentLead,
        DepartmentRelation,
        DepartmentTag,
        DepartmentType,
        Geo,
        GeoLocation,
        Person,
        PersonGeoLocation,
        PersonRole,
        PersonTag,
        RelationType,
        Role,
        Tag,
    )

    from app.routes.auth import auth_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.departments import departments_bp
    from app.routes.people import people_bp
    from app.routes.roles import roles_bp
    from app.routes.relations import relations_bp
    from app.routes.settings import settings_bp
    from app.routes.audit import audit_bp
    from app.routes.visualization import visualization_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(departments_bp)
    app.register_blueprint(people_bp)
    app.register_blueprint(roles_bp)
    app.register_blueprint(relations_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(audit_bp)
    app.register_blueprint(visualization_bp)

    @app.cli.command("seed-admin")
    def seed_admin() -> None:
        from werkzeug.security import generate_password_hash
        from app.models.admin_user import AdminUser

        if AdminUser.query.filter_by(username="admin").first():
            print("admin already exists")
            return

        user = AdminUser(
            username="admin",
            password_hash=generate_password_hash("admin123", method="pbkdf2:sha256"),
            admin_role="super_admin",
        )
        db.session.add(user)
        db.session.commit()
        print("Created default admin: admin / admin123")

    return app
