"""SQLite engine, session factory and declarative base for KhataFlow."""
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# SQLite file lives beside the backend code.
DB_PATH = Path(__file__).parent / "khataflow.db"

engine = create_engine(
    f"sqlite:///{DB_PATH.as_posix()}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for all ORM models."""


def run_migrations() -> None:
    """Idempotent SQLite migration: add columns introduced after the first release."""
    with engine.connect() as conn:
        invoice_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(invoices)"))}
        for col in ("tds_applicable", "gst_applicable"):
            if col not in invoice_cols:
                conn.execute(
                    text(f"ALTER TABLE invoices ADD COLUMN {col} BOOLEAN NOT NULL DEFAULT 0")
                )
        payment_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(payments)"))}
        if "reference" not in payment_cols:
            conn.execute(text("ALTER TABLE payments ADD COLUMN reference VARCHAR"))
        conn.commit()


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a short-lived DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
