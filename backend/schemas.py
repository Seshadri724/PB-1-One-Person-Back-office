"""Pydantic v2 request/response schemas for KhataFlow."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ClientIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    company: str = ""
    phone: str = Field(default="", pattern=r"^(\d{10})?$")
    email: str = ""
    reliability: float = Field(default=0.8, ge=0, le=1)
    avg_days_late: int = Field(default=0, ge=0)


class ClientOut(ClientIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class InvoiceIn(BaseModel):
    client_id: int
    description: str = ""
    amount: int = Field(gt=0)
    issued_date: date
    due_date: date
    number: str | None = None


class InvoiceTextIn(BaseModel):
    """Natural-language invoice, e.g. 'Logo design for Zenith Foods 35k due in 15 days'."""

    text: str = Field(min_length=3)


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: str
    client_id: int
    client_name: str
    description: str
    amount: int
    amount_paid: int
    outstanding: int
    issued_date: date
    due_date: date
    status: str
    days_overdue: int


class PaymentIn(BaseModel):
    amount: int = Field(gt=0)
    paid_on: date | None = None


class BillIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: Literal["rent", "software", "contractor", "utilities", "other"]
    amount: int = Field(gt=0)
    due_day: int = Field(ge=1, le=31)
    recurring: bool = True
    next_due_date: date | None = None


class BillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    category: str
    amount: int
    due_day: int
    recurring: bool
    paid: bool
    next_due_date: date


class BillPatch(BaseModel):
    paid: bool


class ReminderIn(BaseModel):
    tone: Literal["friendly", "firm", "final"]


class ReminderOut(BaseModel):
    message: str
    whatsapp_url: str
    upi_link: str


class FollowUpIn(BaseModel):
    channel: str = "whatsapp"
    tone: str = "friendly"
    note: str = ""


class FollowUpOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    channel: str
    tone: str
    note: str
    created_at: datetime


class SettingsIn(BaseModel):
    business_name: str
    city: str
    upi_id: str
    owner_phone: str = Field(pattern=r"^\d{10}$")
    opening_cash_balance: int
    min_cash_buffer: int = Field(ge=0)


class SettingsOut(SettingsIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class WhatIfScenario(BaseModel):
    type: Literal["client_late", "new_retainer", "drop_client"]
    client_id: int | None = None
    days: int | None = None  # client_late: extra days; new_retainer: start offset
    amount: int | None = None  # new_retainer: monthly inflow
    monthly: bool | None = None  # new_retainer: recurring (default True)


class WhatIfIn(BaseModel):
    scenarios: list[WhatIfScenario] = Field(default_factory=list)


class AlertOut(BaseModel):
    level: Literal["critical", "warning", "info"]
    text: str
    client_id: int | None = None
