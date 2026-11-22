"""KhataFlow FastAPI app. All routes live under /api."""
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Any

from fastapi import Body, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

import forecast
import nlp_helper
import seed
from database import Base, SessionLocal, engine, get_db
from models import Bill, Client, FollowUpLog, Invoice, Payment, Settings
from schemas import (
    AlertOut,
    BillIn,
    BillOut,
    BillPatch,
    ClientIn,
    ClientOut,
    FollowUpIn,
    FollowUpOut,
    InvoiceIn,
    InvoiceTextIn,
    PaymentIn,
    ReminderIn,
    ReminderOut,
    SettingsIn,
    SettingsOut,
    WhatIfIn,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Create tables and seed demo data on first run."""
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed.seed_if_empty(db)
    yield


app = FastAPI(title="KhataFlow", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- helpers ----------

def _get_settings(db: Session) -> Settings:
    settings = db.get(Settings, 1)
    if settings is None:
        settings = Settings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _get_client_or_404(db: Session, client_id: int) -> Client:
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(404, "Client not found")
    return client


def _invoice_out(inv: Invoice, today: date) -> dict[str, Any]:
    return {
        "id": inv.id,
        "number": inv.number,
        "client_id": inv.client_id,
        "client_name": inv.client.name,
        "description": inv.description,
        "amount": inv.amount,
        "amount_paid": inv.amount_paid,
        "outstanding": inv.outstanding,
        "issued_date": inv.issued_date,
        "due_date": inv.due_date,
        "status": inv.status(today),
        "days_overdue": inv.days_overdue(today),
    }


def _next_number(db: Session, today: date) -> str:
    last_id = db.scalar(select(func.max(Invoice.id))) or 0
    return f"PCS-{today.year}-{last_id + 1:03d}"


def _validate_days(days: int) -> None:
    if days not in (30, 60, 90):
        raise HTTPException(422, "days must be 30, 60 or 90")


# ---------- health & dashboard ----------

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)) -> dict[str, Any]:
    today = date.today()
    settings = _get_settings(db)
    open_inv = [
        i for i in db.scalars(select(Invoice)).all()
        if i.status_override != "draft" and i.outstanding > 0
    ]

    fc = forecast.project(db, 90)
    daily = fc["daily"]

    by_client: dict[int, dict[str, Any]] = {}
    for inv in open_inv:
        row = by_client.setdefault(inv.client_id, {
            "client_id": inv.client_id,
            "client_name": inv.client.name,
            "company": inv.client.company,
            "outstanding": 0,
            "days_overdue": 0,
            "invoice_count": 0,
        })
        row["outstanding"] += inv.outstanding
        row["days_overdue"] = max(row["days_overdue"], inv.days_overdue(today))
        row["invoice_count"] += 1
    who_owes = sorted(by_client.values(), key=lambda r: r["days_overdue"], reverse=True)

    return {
        "settings": SettingsOut.model_validate(settings),
        "totals": {
            "total_receivable": sum(i.outstanding for i in open_inv),
            "overdue_amount": sum(i.outstanding for i in open_inv if i.days_overdue(today) > 0),
            "cash_now": settings.opening_cash_balance,
            "cash_30": daily[30]["balance"],
            "cash_60": daily[60]["balance"],
            "cash_90": daily[90]["balance"],
        },
        "alerts": forecast.alerts(db)[:5],
        "who_owes": who_owes,
        "forecast": {
            30: daily[:31],
            60: daily[:61],
            90: daily,
        },
    }


# ---------- clients ----------

@app.get("/api/clients", response_model=list[ClientOut])
def list_clients(db: Session = Depends(get_db)) -> list[Client]:
    return list(db.scalars(select(Client).order_by(Client.name)).all())


@app.post("/api/clients", response_model=ClientOut, status_code=201)
def create_client(payload: ClientIn, db: Session = Depends(get_db)) -> Client:
    client = Client(**payload.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


# ---------- invoices ----------

@app.get("/api/invoices")
def list_invoices(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    today = date.today()
    invoices = db.scalars(select(Invoice).order_by(Invoice.due_date)).all()
    return [_invoice_out(inv, today) for inv in invoices]


@app.post("/api/invoices", status_code=201)
def create_invoice(
    payload: InvoiceIn | InvoiceTextIn = Body(...),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    today = date.today()
    if isinstance(payload, InvoiceTextIn):
        try:
            parsed = nlp_helper.parse_invoice_line(payload.text)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        name = parsed["client_name"].strip()
        if not name:
            raise HTTPException(422, "Could not find a client name (use 'for <Client>')")
        # Match existing client by person name or company, else create one.
        client = db.scalar(select(Client).where(or_(
            func.lower(Client.name) == name.lower(),
            func.lower(Client.company) == name.lower(),
        )))
        if client is None:
            client = Client(name=name, company=name)
            db.add(client)
            db.flush()
        inv = Invoice(
            client=client,
            number=_next_number(db, today),
            description=parsed["description"],
            amount=parsed["amount"],
            issued_date=today,
            due_date=today + timedelta(days=parsed["due_in_days"]),
        )
    else:
        client = _get_client_or_404(db, payload.client_id)
        inv = Invoice(
            client=client,
            number=payload.number or _next_number(db, today),
            description=payload.description,
            amount=payload.amount,
            issued_date=payload.issued_date,
            due_date=payload.due_date,
        )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return _invoice_out(inv, today)


@app.post("/api/invoices/{invoice_id}/payments", status_code=201)
def add_payment(
    invoice_id: int,
    payload: PaymentIn,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    inv = db.get(Invoice, invoice_id)
    if inv is None:
        raise HTTPException(404, "Invoice not found")
    applied = min(payload.amount, inv.outstanding)  # never overpay
    inv.amount_paid += applied
    db.add(Payment(invoice_id=inv.id, amount=applied, paid_on=payload.paid_on or date.today()))
    db.commit()
    db.refresh(inv)
    return _invoice_out(inv, date.today())


# ---------- forecast & alerts ----------

@app.get("/api/forecast")
def get_forecast(days: int = Query(default=90), db: Session = Depends(get_db)) -> dict[str, Any]:
    _validate_days(days)
    return forecast.project(db, days)


@app.post("/api/forecast/whatif")
def run_whatif(
    payload: WhatIfIn,
    days: int = Query(default=90),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    _validate_days(days)
    return forecast.whatif(db, days, payload.scenarios)


@app.get("/api/alerts", response_model=list[AlertOut])
def get_alerts(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    return forecast.alerts(db)


# ---------- bills ----------

@app.get("/api/bills", response_model=list[BillOut])
def list_bills(db: Session = Depends(get_db)) -> list[Bill]:
    return list(db.scalars(select(Bill).order_by(Bill.next_due_date)).all())


@app.post("/api/bills", response_model=BillOut, status_code=201)
def create_bill(payload: BillIn, db: Session = Depends(get_db)) -> Bill:
    data = payload.model_dump()
    if data["next_due_date"] is None:
        data["next_due_date"] = forecast.next_occurrence(date.today(), payload.due_day)
    bill = Bill(**data)
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill


@app.patch("/api/bills/{bill_id}", response_model=BillOut)
def patch_bill(bill_id: int, payload: BillPatch, db: Session = Depends(get_db)) -> Bill:
    bill = db.get(Bill, bill_id)
    if bill is None:
        raise HTTPException(404, "Bill not found")
    bill.paid = payload.paid
    if payload.paid and bill.recurring:
        # Roll to next month's occurrence and re-open for the next cycle.
        bill.next_due_date = forecast.shift_month(bill.next_due_date, bill.due_day)
        bill.paid = False
    db.commit()
    db.refresh(bill)
    return bill


# ---------- reminders & follow-ups ----------

@app.post("/api/clients/{client_id}/reminders", response_model=ReminderOut)
def create_reminder(
    client_id: int,
    payload: ReminderIn,
    db: Session = Depends(get_db),
) -> ReminderOut:
    client = _get_client_or_404(db, client_id)
    settings = _get_settings(db)
    today = date.today()
    unpaid = [i for i in client.invoices if i.status_override != "draft" and i.outstanding > 0]

    if unpaid:
        target = max(unpaid, key=lambda i: i.days_overdue(today))
        upi_link = nlp_helper.build_upi_link(
            settings.upi_id, settings.business_name, target.outstanding, target.number
        )
        message = nlp_helper.draft_reminder(
            client.name,
            target.number,
            target.outstanding,
            target.days_overdue(today),
            payload.tone,
            settings.business_name,
            upi_link,
        )
    else:
        upi_link = nlp_helper.build_upi_link(settings.upi_id, settings.business_name, 0, "Thank you")
        message = (
            f"Hi {client.name.split()[0]}, thank you for being a great client of "
            f"{settings.business_name}! Just checking in, let us know if you need anything "
            "for your next project."
        )

    return ReminderOut(
        message=message,
        whatsapp_url=nlp_helper.build_whatsapp_link(client.phone, message),
        upi_link=upi_link,
    )


@app.post("/api/clients/{client_id}/followups", response_model=FollowUpOut, status_code=201)
def create_followup(
    client_id: int,
    payload: FollowUpIn,
    db: Session = Depends(get_db),
) -> FollowUpLog:
    _get_client_or_404(db, client_id)
    log = FollowUpLog(
        client_id=client_id,
        channel=payload.channel,
        tone=payload.tone,
        note=payload.note,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@app.get("/api/clients/{client_id}/followups", response_model=list[FollowUpOut])
def list_followups(client_id: int, db: Session = Depends(get_db)) -> list[FollowUpLog]:
    _get_client_or_404(db, client_id)
    stmt = (
        select(FollowUpLog)
        .where(FollowUpLog.client_id == client_id)
        .order_by(FollowUpLog.created_at.desc(), FollowUpLog.id.desc())
    )
    return list(db.scalars(stmt).all())


# ---------- settings & reset ----------

@app.get("/api/settings", response_model=SettingsOut)
def get_settings_route(db: Session = Depends(get_db)) -> Settings:
    return _get_settings(db)


@app.put("/api/settings", response_model=SettingsOut)
def update_settings(payload: SettingsIn, db: Session = Depends(get_db)) -> Settings:
    settings = _get_settings(db)
    for field, value in payload.model_dump().items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings


@app.post("/api/reset")
def reset_demo(db: Session = Depends(get_db)) -> dict[str, str]:
    seed.reset(db)
    return {"status": "reset"}
