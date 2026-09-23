"""
SAATHI-AI Database Connection Module
Configured for SQLite by default, with seamless environment-variable configuration for production databases (PostgreSQL/MySQL/SQLite).
"""

import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_PATH = (ROOT_DIR / "saathi_dev.db").as_posix()
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")

# Automatically fix PostgreSQL dialect prefix if provided as postgres:// by cloud providers (e.g. Render/Heroku)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# connect_args={"check_same_thread": False} is required only for SQLite
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency for obtaining a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

