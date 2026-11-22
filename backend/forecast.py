"""Cash-flow projection, what-if scenarios and alerts. Amounts are integer rupees.

Simplifications (documented on purpose):
- An open invoice lands on due_date + client.avg_days_late, weighted by client.reliability.
- An expected date already in the past (overdue) is pushed to today + 7 days.
- Recurring bills repeat monthly on due_day (clamped to month length).
"""
import calendar
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from models import Bill, Invoice, Settings
from nlp_helper import format_inr
from schemas import WhatIfScenario


def _in_month(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _next_month(year: int, month: int) -> tuple[int, int]:
    return (year + month // 12, month % 12 + 1)


def shift_month(d: date, due_day: int) -> date:
    """Same due_day in the month after d (clamped)."""
    y, m = _next_month(d.year, d.month)
    return _in_month(y, m, due_day)


def next_occurrence(today: date, due_day: int) -> date:
    """First date on/after today whose day-of-month is due_day (clamped)."""
    d = _in_month(today.year, today.month, due_day)
    return d if d >= today else shift_month(d, due_day)


def project(db: Session, days: int, scenarios: list[WhatIfScenario] | None = None) -> dict[str, Any]:
    """Day-by-day balance from today through today+days (inclusive)."""
    today = date.today()
    end = today + timedelta(days=days)
    settings = db.get(Settings, 1)
    start_cash = settings.opening_cash_balance if settings else 0
    buffer = settings.min_cash_buffer if settings else 0
    scenarios = scenarios or []

    drop_ids = {s.client_id for s in scenarios if s.type == "drop_client" and s.client_id}
    late_days: dict[int, int] = defaultdict(int)
    for s in scenarios:
        if s.type == "client_late" and s.client_id:
            late_days[s.client_id] += s.days or 0

    inflow: dict[date, int] = defaultdict(int)
    outflow: dict[date, int] = defaultdict(int)

    # Receivables: outstanding * reliability, on the expected payment date.
    for inv in db.query(Invoice).all():
        if inv.status_override == "draft" or inv.outstanding <= 0 or inv.client_id in drop_ids:
            continue
        client = inv.client
        expected = inv.due_date + timedelta(days=client.avg_days_late + late_days[client.id])
        if expected <= today:  # already past -> assume it lands in a week
            expected = today + timedelta(days=7)
        if expected <= end:
            inflow[expected] += round(inv.outstanding * client.reliability)

    # Scenario: new retainer (starts after `days`, repeats every 30 days unless monthly=False).
    for s in scenarios:
        if s.type == "new_retainer" and s.amount:
            d = today + timedelta(days=s.days if s.days is not None else 30)
            repeat = s.monthly if s.monthly is not None else True
            while d <= end:
                inflow[d] += s.amount
                if not repeat:
                    break
                d += timedelta(days=30)

    # Payables: unpaid bills.
    for bill in db.query(Bill).filter(Bill.paid.is_(False)).all():
        if bill.recurring:
            d = bill.next_due_date
            while d < today:
                d = shift_month(d, bill.due_day)
            while d <= end:
                outflow[d] += bill.amount
                d = shift_month(d, bill.due_day)
        else:
            d = max(bill.next_due_date, today)  # overdue one-off bills go out today
            if d <= end:
                outflow[d] += bill.amount

    daily: list[dict[str, Any]] = []
    balance = start_cash
    for i in range(days + 1):
        d = today + timedelta(days=i)
        inf, outf = inflow[d], outflow[d]
        balance += inf - outf
        daily.append({"date": d, "balance": balance, "inflow": inf, "outflow": outf})

    lowest = min(daily, key=lambda p: p["balance"])
    runs_out = next((p["date"] for p in daily if p["balance"] < 0), None)
    below_buffer = next((p["date"] for p in daily if p["balance"] < buffer), None)
    return {
        "days": days,
        "start_cash": start_cash,
        "daily": daily,
        "min_balance": lowest["balance"],
        "min_balance_date": lowest["date"],
        "runs_out_date": runs_out,
        "below_buffer_date": below_buffer,
    }


def whatif(db: Session, days: int, scenarios: list[WhatIfScenario]) -> dict[str, Any]:
    """Baseline vs scenario projection with a delta summary."""
    base = project(db, days)
    scen = project(db, days, scenarios)
    return {
        "baseline": base,
        "scenario": scen,
        "delta": {
            "min_balance": scen["min_balance"] - base["min_balance"],
            "runs_out_date_changed": scen["runs_out_date"] != base["runs_out_date"],
            "cash_at_end": scen["daily"][-1]["balance"] - base["daily"][-1]["balance"],
        },
    }


def alerts(db: Session) -> list[dict[str, Any]]:
    """Critical first, then warning, then info."""
    today = date.today()
    settings = db.get(Settings, 1)
    buffer = settings.min_cash_buffer if settings else 0
    out: list[dict[str, Any]] = []

    for inv in db.query(Invoice).all():
        late = inv.days_overdue(today)
        if late > 0:
            out.append({
                "level": "critical" if late > 30 else "warning",
                "text": f"{inv.client.name} owes {format_inr(inv.outstanding)}, {late} days overdue",
                "client_id": inv.client_id,
            })

    fc = project(db, 90)
    if fc["runs_out_date"]:
        out.append({"level": "critical", "text": f"Cash runs out on {fc['runs_out_date']:%d %b %Y}", "client_id": None})
    elif fc["below_buffer_date"]:
        out.append({
            "level": "warning",
            "text": f"Cash dips below {format_inr(buffer)} on {fc['below_buffer_date']:%d %b %Y}",
            "client_id": None,
        })

    for bill in db.query(Bill).filter(Bill.paid.is_(False)).all():
        if today <= bill.next_due_date <= today + timedelta(days=7):
            out.append({
                "level": "info",
                "text": f"{bill.name} {format_inr(bill.amount)} due on {bill.next_due_date:%d %b}",
                "client_id": None,
            })

    order = {"critical": 0, "warning": 1, "info": 2}
    out.sort(key=lambda a: order[a["level"]])
    return out
