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

    @app.cli.command("init-db")
    def init_db() -> None:
        """Create any missing tables (idempotent, matches models exactly)."""
        db.create_all()
        print("init-db: tables ensured")

    @app.cli.command("reset-db")
    def reset_db() -> None:
        """DROP and recreate all tables. Destructive — only for first deploy."""
        from sqlalchemy import text

        engine = db.engine
        if engine.dialect.name == "postgresql":
            # Raw schema drop avoids circular-FK sort issues with drop_all()
            with engine.begin() as conn:
                conn.execute(text("DROP SCHEMA public CASCADE"))
                conn.execute(text("CREATE SCHEMA public"))
        else:
            db.drop_all()
        db.create_all()
        print("reset-db: all tables dropped and recreated")

    @app.cli.command("patch-schema")
    def patch_schema() -> None:
        """Idempotent column-type fixes for existing Postgres tables."""
        from sqlalchemy import text

        engine = db.engine
        if engine.dialect.name != "postgresql":
            print("patch-schema: skipped (not postgres)")
            return

        statements = [
            "ALTER TABLE departments ALTER COLUMN short_description TYPE TEXT",
            "ALTER TABLE people ALTER COLUMN short_description TYPE TEXT",
            "ALTER TABLE department_relations ALTER COLUMN short_description TYPE TEXT",
        ]
        with engine.begin() as conn:
            for stmt in statements:
                try:
                    conn.execute(text(stmt))
                except Exception as exc:  # noqa: BLE001
                    print(f"patch-schema: skip ({exc})")
        print("patch-schema: done")

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
