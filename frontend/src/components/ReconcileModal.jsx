import { useEffect, useState } from "react";
import { CheckCircle, Search, X } from "lucide-react";
import { confirmReconciliation, parseBankSms } from "../api";

const DUPLICATE_MESSAGE = "Duplicate UPI reference: this payment is already recorded.";

function formatRupees(value) {
  const n = Number(value);
  if (value === null || value === undefined || Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function ReconcileModal({ onClose, onReconciled }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(null); // "parse" | "confirm" | null
  const [error, setError] = useState("");

  // Escape closes the modal.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleParse() {
    if (!text.trim()) {
      setError("Paste the bank SMS first.");
      return;
    }
    setError("");
    setParsed(null);
    setCandidates([]);
    setBusy("parse");
    try {
      const response = await parseBankSms(text.trim());
      setParsed(response.parsed);
      setCandidates(response.candidates ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirm(candidate) {
    setError("");
    setBusy("confirm");
    try {
      const response = await confirmReconciliation({
        invoice_id: candidate.invoice_id,
        amount: parsed.amount,
        reference: parsed.reference,
        sender: parsed.sender,
        text: text.trim(),
      });
      onReconciled?.(response?.dashboard);
      onClose?.();
    } catch (err) {
      const message = err.message || "";
      setError(/duplicate/i.test(message) ? DUPLICATE_MESSAGE : message);
    } finally {
      setBusy(null);
    }
  }

  const amountMissing = parsed !== null && (parsed.amount === null || parsed.amount === undefined);
  const disabled = busy !== null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reconcile-title"
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="reconcile-title" className="text-base font-semibold text-slate-900">
            Reconcile a bank SMS
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] rounded-md p-1 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Bank / UPI credit SMS</span>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the bank/UPI credit SMS here, e.g. Rs 25,000.00 credited to a/c **1234 on 22-Nov-26 via UPI/432109876543/Priya Nair"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleParse}
            disabled={disabled}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Search size={16} />
            {busy === "parse" ? "Parsing…" : "Parse"}
          </button>
        </div>

        {parsed && (
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm">
            <dt className="text-slate-500">Amount</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{formatRupees(parsed.amount)}</dd>
            <dt className="text-slate-500">Direction</dt>
            <dd className="text-slate-900">{parsed.direction || "—"}</dd>
            <dt className="text-slate-500">Account (last 4)</dt>
            <dd className="text-slate-900">{parsed.account_last4 || "—"}</dd>
            <dt className="text-slate-500">Reference</dt>
            <dd className="break-all text-slate-900">{parsed.reference || "—"}</dd>
            <dt className="text-slate-500">Sender</dt>
            <dd className="text-slate-900">{parsed.sender || "—"}</dd>
            <dt className="text-slate-500">Date</dt>
            <dd className="text-slate-900">{parsed.date || "—"}</dd>
          </dl>
        )}

        {amountMissing && (
          <p role="alert" className="mt-3 text-sm text-red-600">Could not read the amount from this SMS.</p>
        )}

        {parsed && !amountMissing && candidates.length === 0 && (
          <p aria-live="polite" className="mt-3 text-sm text-slate-600">No open invoice matches this payment.</p>
        )}

        {parsed && candidates.length > 0 && (
          <ul className="mt-4 space-y-3">
            {candidates.map((c) => (
              <li
                key={c.invoice_id}
                className="rounded-lg border border-slate-200 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{c.invoice_number}</p>
                    <p className="text-slate-600">{c.client_name}</p>
                    <p className="text-slate-600">
                      Outstanding <span className="font-medium tabular-nums text-slate-900">{formatRupees(c.outstanding)}</span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    {c.score}/100
                  </span>
                </div>

                {(c.reasons || []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.reasons.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleConfirm(c)}
                    disabled={disabled || amountMissing}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <CheckCircle size={16} />
                    {busy === "confirm" ? "Confirming…" : "Confirm & Mark Paid"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
