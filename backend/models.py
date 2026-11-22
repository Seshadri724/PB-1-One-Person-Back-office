"""SQLAlchemy 2 ORM models. All amounts are integer rupees."""
from datetime import date, datetime

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Settings(Base):
    """Single-row business settings (id=1)."""

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    business_name: Mapped[str] = mapped_column(String(120), default="PixelCraft Studio")
    city: Mapped[str] = mapped_column(String(80), default="Hyderabad")
    upi_id: Mapped[str] = mapped_column(String(80), default="pixelcraft@upi")
    owner_phone: Mapped[str] = mapped_column(String(10), default="9876543210")
    opening_cash_balance: Mapped[int] = mapped_column(default=180000)
    min_cash_buffer: Mapped[int] = mapped_column(default=60000)


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    company: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(10), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    reliability: Mapped[float] = mapped_column(default=0.8)  # 0..1 payment reliability
    avg_days_late: Mapped[int] = mapped_column(default=0)

    invoices: Mapped[list["Invoice"]] = relationship(back_populates="client")
    followups: Mapped[list["FollowUpLog"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    number: Mapped[str] = mapped_column(String(32), unique=True)
    description: Mapped[str] = mapped_column(String(200), default="")
    amount: Mapped[int]
    amount_paid: Mapped[int] = mapped_column(default=0)
    issued_date: Mapped[date]
    due_date: Mapped[date]
    # Only "draft" or "sent" are stored; other statuses are derived in status().
    status_override: Mapped[str | None] = mapped_column(String(10), default=None)
    tds_applicable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    gst_applicable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    client: Mapped[Client] = relationship(back_populates="invoices")
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="Payment.paid_on"
    )

    @property
    def gross_amount(self) -> int:
        return self.amount

    @property
    def tds_amount(self) -> float:
        return round(self.gross_amount * 0.10, 2) if self.tds_applicable else 0.0

    @property
    def gst_amount(self) -> float:
        return round(self.gross_amount * 0.18, 2) if self.gst_applicable else 0.0

    @property
    def total_billed(self) -> float:
        return self.gross_amount + self.gst_amount

    @property
    def net_receivable(self) -> float:
        return self.total_billed - self.tds_amount

    @property
    def outstanding(self) -> int:
        return max(0, self.net_receivable - (self.amount_paid or 0))

    def status(self, today: date) -> str:
        """Derive draft / paid / partially_paid / overdue / sent."""
        if self.status_override == "draft":
            return "draft"
        if (self.amount_paid or 0) >= self.amount:
            return "paid"
        if (self.amount_paid or 0) > 0:
            return "partially_paid"
        if self.due_date < today:
            return "overdue"
        return "sent"

    def days_overdue(self, today: date) -> int:
        """Days past due for any open, non-draft invoice; 0 otherwise."""
        if self.status_override == "draft" or self.outstanding == 0:
            return 0
        return max(0, (today - self.due_date).days)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    amount: Mapped[int]
    paid_on: Mapped[date]
    reference: Mapped[str | None] = mapped_column(String, nullable=True)

    invoice: Mapped[Invoice] = relationship(back_populates="payments")


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(20))  # rent|software|contractor|utilities|other
    amount: Mapped[int]
    due_day: Mapped[int]  # day of month, 1-31
    recurring: Mapped[bool] = mapped_column(default=True)
    paid: Mapped[bool] = mapped_column(default=False)
    next_due_date: Mapped[date]


class FollowUpLog(Base):
    __tablename__ = "followup_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    channel: Mapped[str] = mapped_column(String(20), default="whatsapp")
    tone: Mapped[str] = mapped_column(String(20), default="friendly")
    note: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)

    client: Mapped[Client] = relationship(back_populates="followups")
