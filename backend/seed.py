"""Demo seed data. All dates are relative to date.today()."""
from datetime import date, timedelta

from sqlalchemy.orm import Session

from forecast import next_occurrence
from models import Bill, Client, FollowUpLog, Invoice, Payment, Settings

# name, company, phone, email, reliability, avg_days_late
CLIENTS: list[tuple[str, str, str, str, float, int]] = [
    ("Rahul Mehta", "Zenith Foods", "9876501001", "rahul@zenithfoods.in", 0.5, 22),
    ("Priya Nair", "Kapoor & Sons Textiles", "9876501002", "priya@kapoortextiles.in", 0.9, 5),
    ("Arjun Reddy", "Bluebird Realty", "9876501003", "arjun@bluebirdrealty.in", 0.85, 20),
    ("Sneha Iyer", "Hyderabad Startup Hub", "9876501004", "sneha@hydstartuphub.in", 0.95, 0),
    ("Vikram Rao", "Deccan Brews", "9876501005", "vikram@deccanbrews.in", 0.7, 12),
    ("Meera Joshi", "Lotus Hospitals", "9876501006", "meera@lotushospitals.in", 0.95, 3),
    ("Karthik Varma", "Aurora Fashions", "9876501007", "karthik@aurorafashions.in", 0.6, 20),
    ("Ananya Das", "GreenLeaf Organics", "9876501008", "ananya@greenleaf.in", 0.9, 2),
]

# client index, description, amount, due offset (days from today), amount_paid, status_override
INVOICES: list[tuple[int, str, int, int, int, str | None]] = [
    (0, "Brand identity – Zenith Foods", 45000, -22, 0, None),  # demo: overdue 22 days
    (1, "Packaging design – Kapoor Textiles", 25000, 10, 0, None),
    (2, "Office signage design", 60000, -40, 60000, None),
    (3, "UI/UX sprint – Startup Hub", 90000, -60, 90000, None),
    (4, "Cafe menu & social kit", 18000, -15, 18000, None),
    (5, "Hospital wayfinding graphics", 120000, 60, 0, None),
    (6, "Lookbook shoot", 30000, -10, 25000, None),  # partially paid, overdue
    (7, "Campaign assets – GreenLeaf", 40000, -35, 40000, None),
    (1, "Annual report layout", 30000, -5, 30000, None),
    (4, "Taproom signage", 22000, -45, 22000, None),
    (5, "Patient app icons", 50000, 40, 0, None),
    (2, "Tower A brochure", 55000, 20, 0, None),
    (3, "Pitch deck refresh", 28000, 50, 0, None),
    (6, "Monsoon campaign", 42000, 70, 0, None),
    (7, "Packaging refresh", 26000, 33, 0, None),
    (0, "Social media kit – Zenith", 20000, 15, 0, None),
    (1, "Fabric swatch catalogue", 16000, 45, 0, None),
    (4, "Event poster series", 12000, -30, 12000, None),
    (5, "Newsletter templates", 9000, -70, 9000, None),
    (2, "Phase 2 concept", 48000, 5, 0, "draft"),
    (6, "Spring lookbook", 27000, -55, 27000, None),
    (7, "Print collateral", 14000, 60, 0, None),
    (3, "Retainer – March", 35000, -28, 35000, None),
    (0, "Website copy", 15000, 75, 0, None),
    (7, "Organic label design", 14000, 18, 0, None),
]

# name, category, amount, due_day
BILLS: list[tuple[str, str, int, int]] = [
    ("Office rent", "rent", 38000, 1),
    ("Adobe Creative Cloud", "software", 4999, 5),
    ("Figma", "software", 1500, 8),
    ("Google Workspace", "software", 1800, 10),
    ("Internet broadband", "utilities", 1199, 12),
    ("Contractor – Ravi (illustration)", "contractor", 18000, 25),
    ("Contractor – Sana (web dev)", "contractor", 12000, 28),
]


def seed_demo(db: Session) -> None:
    """Wipe all tables and insert the demo dataset."""
    for model in (Payment, FollowUpLog, Invoice, Bill, Client, Settings):
        db.query(model).delete()

    db.add(Settings(
        id=1,
        business_name="PixelCraft Studio",
        city="Hyderabad",
        upi_id="pixelcraft@upi",
        owner_phone="9876543210",
        opening_cash_balance=120000,
        min_cash_buffer=60000,
    ))

    clients = [
        Client(name=n, company=c, phone=p, email=e, reliability=r, avg_days_late=late)
        for n, c, p, e, r, late in CLIENTS
    ]
    db.add_all(clients)
    db.flush()

    today = date.today()
    for n, (ci, desc, amount, due_off, paid, override) in enumerate(INVOICES, start=1):
        due = today + timedelta(days=due_off)
        inv = Invoice(
            client=clients[ci],
            number=f"PCS-{today.year}-{n:03d}",
            description=desc,
            amount=amount,
            amount_paid=paid,
            issued_date=min(today, due - timedelta(days=30)),
            due_date=due,
            status_override=override,
        )
        db.add(inv)
        if paid:
            db.add(Payment(invoice=inv, amount=paid, paid_on=min(today, due)))

    for name, category, amount, due_day in BILLS:
        db.add(Bill(
            name=name,
            category=category,
            amount=amount,
            due_day=due_day,
            recurring=True,
            paid=False,
            next_due_date=next_occurrence(today, due_day),
        ))

    db.commit()


def reset(db: Session) -> None:
    """Reset to demo data."""
    seed_demo(db)


def seed_if_empty(db: Session) -> None:
    """Seed only when no settings row exists yet (startup)."""
    if db.query(Settings).count() == 0:
        seed_demo(db)
