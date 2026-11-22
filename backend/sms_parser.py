"""Parse Indian bank / UPI credit SMS text. Never raises."""

import re
from datetime import datetime

_AMOUNT_RE = re.compile(
    r"(?:Rs\.?|INR|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", re.IGNORECASE
)
_ACCOUNT_RE = re.compile(
    r"(?:a/c|ac|acct|account)\s*(?:no\.?)?\s*(?:\*+|X+)\s*(\d{4})", re.IGNORECASE
)
_UPI_REF_RE = re.compile(r"UPI/(\d{6,})")
_FALLBACK_REF_RE = re.compile(
    r"(?:UPI\s*Ref(?:erence)?|Ref\s*No\.?|UTR)[:\s]*([A-Za-z0-9]{6,})", re.IGNORECASE
)
_SENDER_RE = re.compile(
    r"^/?([A-Za-z][A-Za-z .]*?)(?:\.|,|\s+on\b|\s+Avl|\s+Bal|$)"
)
_DATE_RE = re.compile(r"(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})")


def _empty() -> dict:
    return {
        "amount": None,
        "direction": None,
        "account_last4": None,
        "reference": None,
        "sender": None,
        "date": None,
    }


def parse_bank_sms(text: str) -> dict:
    try:
        result = _empty()

        # amount
        m = _AMOUNT_RE.search(text)
        if m:
            result["amount"] = float(m.group(1).replace(",", ""))

        # direction
        lower = text.lower()
        if "credited" in lower:
            result["direction"] = "credit"
        elif "debited" in lower:
            result["direction"] = "debit"

        # account last 4
        m = _ACCOUNT_RE.search(text)
        if m:
            result["account_last4"] = m.group(1)

        # reference + sender
        upi_match = _UPI_REF_RE.search(text)
        if upi_match:
            result["reference"] = upi_match.group(1)
            remainder = text[upi_match.end():]
            sm = _SENDER_RE.match(remainder)
            if sm:
                result["sender"] = sm.group(1).strip()
        else:
            fm = _FALLBACK_REF_RE.search(text)
            if fm:
                result["reference"] = fm.group(1)

        # date
        m = _DATE_RE.search(text)
        if m:
            d, mon, yyyy = m.group(1), m.group(2), m.group(3)
            try:
                fmt = "%d-%b-%y" if len(yyyy) == 2 else "%d-%b-%Y"
                result["date"] = datetime.strptime(
                    f"{d}-{mon}-{yyyy}", fmt
                ).date().isoformat()
            except ValueError:
                result["date"] = None

        return result
    except Exception:
        return _empty()
