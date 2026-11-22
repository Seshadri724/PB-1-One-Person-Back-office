# KhataFlow — The One-Person Back Office ⚡

> **Cash-flow intelligence and receivables engine for solo creative studios, agencies, and freelancers in India.**  
> *Know who owes you, forecast your 30–90 day runway, and collect money faster with zero accounting jargon.*

---

## 💡 Why This Project Helps: Solving the Solo Founder's Cash-Flow Dilemma

Most solo creative studios, designers, and freelance developers don't fail because of poor client work — **they fail because of cash-flow insolvency**.

In India, over **80% of independent creative professionals struggle with delayed client payments** (averaging 15–45 days late), unexpected 10% TDS deductions, and awkward payment follow-ups. Traditional accounting software (Tally, QuickBooks, Zoho) is backward-looking, cluttered with double-entry ledgers, and built for accountants rather than creative operators.

**KhataFlow transforms financial anxiety into clarity by answering the 3 existential questions every solo founder wakes up asking:**

```
┌────────────────────────────────────────────────────────────────────────┐
│  1. Who owes me money, and who do I chase RIGHT NOW?                   │
│  2. Will I survive the next 30, 60, or 90 days?                        │
│  3. What happens if my largest client delays payment by 30 days?       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 How KhataFlow Helps You Win

### 1. 🛡️ Dual-Runway Intelligence (Safe vs. Zero-Cash Runway)
- Traditional tools only show current bank balances. KhataFlow calculates your **Safe Runway** (days until hitting your minimum safety buffer) and **Zero-Cash Runway** (days until absolute ₹0).
- Dynamically weights open receivables by **client reliability scores** and historical payment delays, giving an honest, realistic forecast rather than wishful thinking.

### 2. ⚡ "Who do I Chase RIGHT NOW?" Smart Queue
- Automatically sorts outstanding invoices by **overdue urgency** and risk.
- **1-Click Calibrated Reminders**: Generates contextual WhatsApp & Email messages with three tones (**Gentle**, **Firm**, and **Urgent**) crafted for Indian business etiquette.
- **Dynamic Scannable UPI QR & Instant App Links**: Every reminder and follow-up drawer embeds dynamic UPI links (`upi://pay`) and scannable QR codes pre-populated with the exact amount, invoice number, and recipient UPI ID for instant settlement via **GPay, PhonePe, Paytm, or BHIM**.

### 3. 🔮 "What If...?" Scenario Simulator
- Stress-test your business before crises hit:
  - *"What if Rahul Mehta pays 45 days late?"*
  - *"What if I purchase a new MacBook or hire a contractor this month?"*
- Visualizes the immediate impact on your 30–90 day cash forecast so you can make informed decisions before taking on expenses.

### 4. 🚨 "Bad Day? Triage" Crisis Kit
When cash dips below your safety buffer, KhataFlow provides active survival levers rather than passive graphs:
- **Instant Discount Lever**: Issue a time-bound 5–10% early-clearance discount to unlock urgent liquidity in under 24 hours.
- **Bill Deferral**: Postpone non-critical recurring bills (software subscriptions, studio upgrades) to preserve critical runway for rent and payroll.

### 5. 📲 Zero-Friction Bank SMS Reconciliation
- Simply copy-paste a bank credit SMS (from HDFC, ICICI, SBI, Axis) or UPI transaction notification.
- Built-in NLP parses the amount, sender tokens, and UTR/reference number, fuzzy-matches the corresponding invoice, and reconciles the payment in **one click**.

### 6. 🇮🇳 Tailored for the Indian Business Ecosystem
- Native **TDS (10%)** and **GST (18%)** calculation modes (tracks gross billed vs. net receivable).
- Standard Indian numbering formatting (`₹1,20,000`, lakhs, crores).
- **Modern Bahi-Khata UI**: Crisp typography (*Plus Jakarta Sans* + *JetBrains Mono*), zero visual clutter, and accessible responsive controls.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts (cash flow trajectory), Lucide Icons, Canvas Confetti.
- **Backend**: FastAPI (Python 3.10+), SQLAlchemy 2 ORM, SQLite, Pydantic v2 schemas.
- **Domain Engines**:
  - `forecast.py`: Daily cash projection engine with reliability weighting and runway computation.
  - `nlp_helper.py`: Natural language invoice parsing and reminder generation with UPI deep-linking.
  - `sms_parser.py`: Multi-bank SMS parser with fuzzy invoice matching.

---

## 🚀 Quickstart Guide

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm

### Terminal 1 — Backend
From the `khataflow` project root:

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
*API runs at `http://127.0.0.1:8000` (docs available at `/docs`). Demo data is seeded automatically.*

### Terminal 2 — Frontend
From the `khataflow` project root:

```bash
cd frontend
npm install
npm run dev
```
*Open [http://localhost:5173](http://localhost:5173) in your browser.*

---

## 🧪 Verification & Quality Checks

- **Linting**: Run `npx eslint src` in `frontend/` (0 errors, 0 warnings).
- **Production Build**: Run `npm run build` in `frontend/` to test production asset bundling.
- **Reset Demo Data**: Click the **Reset demo data** button in the header at any time to restore the default studio dataset.
