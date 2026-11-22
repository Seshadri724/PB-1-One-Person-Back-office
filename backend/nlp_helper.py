"""Invoice-line parsing and reminder drafting.

Deterministic regex is always the baseline. If GEMINI_API_KEY is set, Gemini is
tried first with a 4s timeout; any failure silently falls back to the regex/template.
"""
import json
import os
import re
from typing import Any
from urllib.parse import quote, urlencode

import httpx

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
DUE_RE = re.compile(r"\bdue\s+in\s+(\d+)\s+days?\b", re.IGNORECASE)
AMOUNT_RE = re.compile(r"(?:₹|rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|l|k)?\b", re.IGNORECASE)
FOR_RE = re.compile(r"\bfor\b", re.IGNORECASE)


def format_inr(n: int) -> str:
    """Indian digit grouping: 145000 -> '₹1,45,000'."""
    sign = "-" if n < 0 else ""
    digits = str(abs(int(n)))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups) + "," + tail
    return f"{sign}₹{digits}"


def build_upi_link(upi_id: str, name: str, amount: int, note: str) -> str:
    """UPI deep link; the amount is omitted when it is zero or negative."""
    params: dict[str, str] = {"pa": upi_id, "pn": name, "cu": "INR", "tn": note}
    if amount > 0:
        params["am"] = str(amount)
    return f"upi://pay?{urlencode(params)}"


def build_whatsapp_link(phone10: str, text: str) -> str:
    """wa.me link for an Indian 10-digit number."""
    return f"https://wa.me/91{phone10}?text={quote(text)}"


def _gemini(prompt: str) -> str | None:
    """Single Gemini call. Returns None on missing key or any error."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    try:
        resp = httpx.post(
            f"{GEMINI_URL}?key={key}",
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=4.0,
        )
        resp.raise_for_status()
        text: str = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return text
    except Exception:
        return None


def _to_amount(num: str, suffix: str | None) -> int:
    """'35k' -> 35000, '1.5L' -> 150000, '35,000' -> 35000."""
    multipliers = {"k": 1_000, "l": 100_000, "lakh": 100_000, "lakhs": 100_000}
    mult = multipliers.get((suffix or "").lower(), 1)
    return round(float(num.replace(",", "")) * mult)


def _regex_parse(text: str) -> dict[str, Any]:
    """Deterministic parser. Raises ValueError if no amount is present."""
    due = DUE_RE.search(text)
    due_in_days = int(due.group(1)) if due else 15
    body = DUE_RE.sub("", text).strip()

    amounts = list(AMOUNT_RE.finditer(body))
    if not amounts:
        raise ValueError("No amount found in invoice text")
    amount_match = amounts[-1]  # amount normally comes last
    amount = _to_amount(amount_match.group(1), amount_match.group(2))

    head = body[: amount_match.start()].strip()
    for_match = FOR_RE.search(head)
    if for_match:
        description = head[: for_match.start()].strip(" ,-")
        client_name = head[for_match.end():].strip(" ,-")
    else:
        description = head.strip(" ,-")
        client_name = ""
    return {
        "client_name": client_name,
        "amount": amount,
        "description": description,
        "due_in_days": due_in_days,
    }


def parse_invoice_line(text: str) -> dict[str, Any]:
    """Return {client_name, amount, description, due_in_days}."""
    raw = _gemini(
        "Extract invoice fields from the text below. Reply with JSON only, keys: "
        "client_name (string), amount (integer rupees), description (string), "
        f"due_in_days (integer, default 15). Text: {text}"
    )
    if raw:
        try:
            cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```")
            data = json.loads(cleaned)
            return {
                "client_name": str(data["client_name"]),
                "amount": int(data["amount"]),
                "description": str(data["description"]),
                "due_in_days": int(data.get("due_in_days", 15)),
            }
        except Exception:
            pass  # fall through to regex
    return _regex_parse(text)


def draft_reminder(
    client_name: str,
    invoice_number: str,
    amount_due: int,
    days_overdue: int,
    tone: str,
    business_name: str,
    upi_link: str,
) -> str:
    """WhatsApp-ready payment reminder. Template is always available; Gemini is optional."""
    amt = format_inr(amount_due)
    first = client_name.split()[0] if client_name.strip() else "there"
    when = f"{days_overdue} days overdue" if days_overdue > 0 else "due soon"

    if tone == "friendly":
        msg = (
            f"Hi {first}, hope you're doing well! A quick reminder that invoice "
            f"{invoice_number} for {amt} is {when}. You can pay directly via UPI: "
            f"{upi_link}\nThank you! - {business_name}"
        )
    elif tone == "firm":
        msg = (
            f"Hi {first}, invoice {invoice_number} for {amt} is {when}. Please arrange "
            f"payment this week. UPI: {upi_link}\nThanks, {business_name}"
        )
    else:  # final
        msg = (
            f"Hi {first}, this is our final reminder: invoice {invoice_number} for {amt} "
            f"is {when}. Kindly clear it within 3 working days, or we will have to pause "
            f"further work. UPI: {upi_link}\n- {business_name}"
        )

    polished = _gemini(
        f"Rewrite this as a short, polite WhatsApp message in a {tone} tone. Keep every "
        f"fact and the UPI link unchanged. Reply with the message only.\n\n{msg}"
    )
    return polished.strip() if polished else msg
