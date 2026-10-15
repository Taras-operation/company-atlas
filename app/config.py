import os


def _normalize_db_url(url):
    # Render/Heroku/Railway provide postgres:// but SQLAlchemy needs postgresql://
    if not url:
        return url
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    # Pin the driver to psycopg2 explicitly. Newer SQLAlchemy versions default
    # the bare postgresql:// dialect to psycopg (v3), which isn't installed, so
    # we force psycopg2 regardless of the SQLAlchemy version pip resolves.
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(
        os.environ.get("DATABASE_URL", "sqlite:///app.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
