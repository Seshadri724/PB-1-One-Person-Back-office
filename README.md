# KhataFlow — The One-Person Back Office

Cash-flow and receivables tracker for solo creative studios in India. Answers: who owes me, will I run out of cash in 30–90 days, and who do I chase right now?

## Run it (2 commands)

Terminal 1 — backend (from the `khataflow` folder):

```
cd backend && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt && uvicorn main:app --reload --port 8000
```

Terminal 2 — frontend (from the `khataflow` folder):

```
cd frontend && npm install && npm run dev
```

Then open http://localhost:5173. Demo data is seeded automatically on first start. Use "Reset demo data" in the top bar to restore it.

## Optional: AI features

Set `GEMINI_API_KEY` in the backend terminal before starting uvicorn to enable Gemini-powered invoice parsing and reminder drafts. Without it, everything runs on deterministic rules and templates.
