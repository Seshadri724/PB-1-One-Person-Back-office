"""KhataFlow FastAPI app. All routes live under /api."""
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from fastapi import Body, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

import forecast
import nlp_helper
import seed
from database import Base, SessionLocal, engine, get_db, run_migrations
from models import Bill, Client, FollowUpLog, Invoice, Payment, Settings
from sms_parser import parse_bank_sms
from schemas import (
    AlertOut,
    BillIn,
    BillOut,
    BillPatch,
    ClientIn,
    ClientOut,
    DeferBillIn,
    DiscountIn,
    FollowUpIn,
    FollowUpOut,
    InvoiceIn,
    InvoiceTextIn,
    PaymentIn,
    ReconcileConfirmIn,
    ReconcileParseIn,
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
    run_migrations()
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
        "gross_amount": inv.gross_amount,
        "tds_amount": inv.tds_amount,
        "gst_amount": inv.gst_amount,
        "total_billed": inv.total_billed,
        "net_receivable": inv.net_receivable,
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
            tds_applicable=payload.tds_applicable,
            gst_applicable=payload.gst_applicable,
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


@app.get("/api/runway")
def get_runway(db: Session = Depends(get_db)) -> dict[str, Any]:
    settings = db.get(Settings, 1)
    buffer = settings.min_cash_buffer if settings else 0

    # Same definition as the forecast's starting point, plus payments received and minus bills already paid.
    received = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0))) or 0
    paid_bills = db.scalar(select(func.coalesce(func.sum(Bill.amount), 0)).where(Bill.paid.is_(True))) or 0
    current_cash = (settings.opening_cash_balance if settings else 0) + received - paid_bills

    # Open receivables weighted by client reliability (same open-invoice filter as forecast.project).
    weighted = 0.0
    for inv in db.query(Invoice).all():
        if inv.status_override == "draft" or inv.outstanding <= 0:
            continue
        weighted += inv.outstanding * inv.client.reliability

    # Reuse the forecast's daily inflow/outflow projection. It starts from the opening balance,
    # so shift it onto current_cash; the flows themselves are unchanged.
    fc = forecast.project(db, 365)
    daily = fc["daily"]
    shift = current_cash - fc["start_cash"]
    upcoming_fixed = sum(p["outflow"] for p in daily[:91])  # today .. today+90

    def first_day_below(threshold: int) -> int | None:
        if current_cash < threshold:
            return 0
        for i, p in enumerate(daily):
            if p["balance"] + shift < threshold:
                return i
        return None

    safe_runway = first_day_below(buffer)
    zero_runway = first_day_below(0)

    governing = safe_runway if safe_runway is not None else 365
    if (safe_runway is not None and safe_runway < 30) or current_cash < buffer:
        status = "critical"
    elif 30 <= governing < 60:
        status = "caution"
    else:
        status = "healthy"

    return {
        "current_cash": current_cash,
        "min_cash_buffer": buffer,
        "expected_receivables_weighted": round(weighted),
        "upcoming_fixed_bills": upcoming_fixed,
        "safe_runway_days": safe_runway,
        "zero_cash_runway_days": zero_runway,
        "status": status,
        "formula_note": "Based on expected receivables weighted by client reliability minus upcoming fixed bills.",
    }


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


# ---------- bank-SMS reconciliation ----------

@app.post("/api/reconcile/parse")
def reconcile_parse(payload: ReconcileParseIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    parsed = parse_bank_sms(payload.text)
    amount = parsed.get("amount")
    reference = parsed.get("reference")
    sender_tokens = [t for t in (parsed.get("sender") or "").lower().split() if len(t) >= 3]
    text_lower = payload.text.lower()

    open_inv = [
        i for i in db.scalars(select(Invoice)).all()
        if i.status_override != "draft" and i.outstanding > 0
    ]
    candidates: list[dict[str, Any]] = []
    for inv in open_inv:
        score = 0
        reasons: list[str] = []
        outstanding = float(inv.outstanding)
        if amount is not None:
            if abs(amount - outstanding) <= 1:
                score += 50
                reasons.append("amount equals outstanding")
            elif abs(amount - outstanding) <= 0.01 * outstanding:
                score += 25
                reasons.append("amount within 1% of outstanding")
        haystack = f"{inv.client.name} {inv.client.company}".lower()
        if any(tok in haystack for tok in sender_tokens):
            score += 20
            reasons.append("sender matches client")
        if inv.number.lower() in text_lower:
            score += 15
            reasons.append("invoice number in SMS")
        if reference and any(p.reference == reference for p in inv.payments):
            score += 10
            reasons.append("reference matches a payment")
        if score > 0:
            candidates.append({
                "invoice_id": inv.id,
                "invoice_number": inv.number,
                "client_name": inv.client.name,
                "outstanding": inv.outstanding,
                "score": score,
                "reasons": reasons,
            })

    candidates.sort(key=lambda c: c["score"], reverse=True)
    return {"parsed": parsed, "candidates": candidates[:5]}


@app.post("/api/reconcile/confirm")
def reconcile_confirm(payload: ReconcileConfirmIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    inv = db.get(Invoice, payload.invoice_id)
    if inv is None:
        raise HTTPException(404, "Invoice not found")
    if payload.reference and db.scalar(
        select(Payment.id).where(Payment.reference == payload.reference)
    ) is not None:
        raise HTTPException(409, "Duplicate UPI reference")
    applied = round(min(payload.amount, inv.outstanding))  # never overpay; column is integer rupees
    inv.amount_paid += applied
    db.add(Payment(
        invoice_id=inv.id,
        amount=applied,
        paid_on=date.today(),
        reference=payload.reference,
    ))
    db.commit()
    db.refresh(inv)
    return {"invoice": _invoice_out(inv, date.today()), "dashboard": dashboard(db)}


# ---------- triage levers ----------

def _open_invoices(db: Session, client_id: int | None = None) -> list[Invoice]:
    stmt = select(Invoice)
    if client_id is not None:
        stmt = stmt.where(Invoice.client_id == client_id)
    return [i for i in db.scalars(stmt).all() if i.status_override != "draft" and i.outstanding > 0]


def _upi_link_for(settings: Settings, amount: str, invoice_number: str) -> str:
    return (
        f"upi://pay?pa={quote(settings.upi_id, safe='')}"
        f"&pn={quote(settings.business_name, safe='')}"
        f"&am={quote(amount, safe='')}"
        f"&cu=INR"
        f"&tn={quote(invoice_number, safe='')}"
    )


@app.post("/api/levers/discount")
def lever_discount(payload: DiscountIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    today = date.today()
    settings = _get_settings(db)
    if payload.invoice_id is not None:
        inv = db.get(Invoice, payload.invoice_id)
        if inv is None:
            raise HTTPException(404, "Invoice not found")
    else:
        pool = _open_invoices(db, payload.client_id)
        if not pool:
            raise HTTPException(404, "No open invoices to discount")
        inv = max(pool, key=lambda i: i.days_overdue(today))

    original = round(inv.outstanding, 2)
    discount_amount = round(original * payload.discount_percent / 100, 2)
    discounted = round(original - discount_amount, 2)
    valid_until = datetime.now(timezone.utc) + timedelta(hours=payload.hours)
    upi_link = _upi_link_for(settings, f"{discounted:.2f}", inv.number)
    first = inv.client.name.split()[0] if inv.client.name.strip() else "there"
    whatsapp_text = (
        f"Hi {first}, thank you for your prompt attention to invoice {inv.number}. "
        f"Clear {nlp_helper.format_inr(round(discounted))} (instead of "
        f"{nlp_helper.format_inr(round(original))}) by "
        f"{valid_until.strftime('%d %b %Y, %H:%M')} UTC and we will waive the "
        f"{payload.discount_percent:g}% balance. UPI: {upi_link}\n- {settings.business_name}"
    )
    return {
        "client_name": inv.client.name,
        "invoice_number": inv.number,
        "original_outstanding": original,
        "discount_amount": discount_amount,
        "discounted_amount": discounted,
        "valid_until": valid_until.isoformat(),
        "upi_link": upi_link,
        "whatsapp_text": whatsapp_text,
    }


@app.post("/api/levers/defer-bill")
def lever_defer_bill(payload: DeferBillIn, db: Session = Depends(get_db)) -> dict[str, Any]:
    bill = db.get(Bill, payload.bill_id)
    if bill is None:
        raise HTTPException(404, "Bill not found")
    bill.next_due_date = bill.next_due_date + timedelta(days=payload.days)
    db.commit()
    db.refresh(bill)
    return {
        "bill": BillOut.model_validate(bill).model_dump(mode="json"),
        "runway": get_runway(db),
    }


@app.get("/api/levers/staggered-chase")
def lever_staggered_chase(db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    today = date.today()
    settings = _get_settings(db)

    # Per client, the open invoice that is most overdue.
    worst: dict[int, Invoice] = {}
    for inv in _open_invoices(db):
        if inv.days_overdue(today) <= 0:
            continue
        cur = worst.get(inv.client_id)
        if cur is None or inv.days_overdue(today) > cur.days_overdue(today):
            worst[inv.client_id] = inv

    results: list[dict[str, Any]] = []
    used: set[int] = set()
    for tone, target_days in (("friendly", 5), ("firm", 15), ("final", 30)):
        candidates = [inv for cid, inv in worst.items() if cid not in used]
        if not candidates:
            continue
        inv = min(candidates, key=lambda i: abs(i.days_overdue(today) - target_days))
        used.add(inv.client_id)
        days_late = inv.days_overdue(today)
        upi_link = _upi_link_for(settings, f"{inv.outstanding:.2f}", inv.number)
        message = nlp_helper.draft_reminder(
            inv.client.name,
            inv.number,
            round(inv.outstanding),
            days_late,
            tone,
            settings.business_name,
            upi_link,
        )
        results.append({
            "client_id": inv.client_id,
            "client_name": inv.client.name,
            "days_late": days_late,
            "tone": tone,
            "outstanding": round(inv.outstanding, 2),
            "message": message,
        })
    return results


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
