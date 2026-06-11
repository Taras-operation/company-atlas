import os


def _normalize_db_url(url):
    # Render/Heroku/Railway provide postgres:// but SQLAlchemy needs postgresql://
    if url and url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(
        os.environ.get("DATABASE_URL", "sqlite:///app.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
