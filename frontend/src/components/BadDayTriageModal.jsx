import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getAlerts, getBills, getDashboard } from "../api";
import { daysBetween, formatDate, formatINR } from "../utils/format";

// Builds the ordered "3 things today" list:
// 1. critical overdue clients (>30 days late), 2. bills due within 7 days, 3. forecast dip.
function buildActions({ dashboard, alerts, bills }) {
  const today = new Date();
  const items = [];

  (dashboard?.who_owes || [])
    .filter((c) => c.days_overdue > 30)
    .forEach((c) =>
      items.push({
        key: `client-${c.client_id}`,
        text: `Chase ${c.client_name}: ${formatINR(c.outstanding)}, ${c.days_overdue} days overdue`,
        clientId: c.client_id,
      }),
    );

  (bills || [])
    .filter((b) => !b.paid)
    .filter((b) => {
      const d = daysBetween(today, b.next_due_date);
      return d >= 0 && d <= 7;
    })
    .forEach((b) =>
      items.push({
        key: `bill-${b.id}`,
        text: `Pay ${b.name} ${formatINR(b.amount)} due ${formatDate(b.next_due_date)}`,
        clientId: null,
      }),
    );

  const dip = (alerts || []).find((a) => a.client_id == null && a.level !== "info");
  if (dip) {
    items.push({ key: "forecast-dip", text: dip.text, clientId: null });
  }

  return items;
}

export default function BadDayTriageModal({ open, onClose, onOpenClient }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([getDashboard(), getAlerts(), getBills()])
      .then(([dashboard, alerts, bills]) => {
        if (!cancelled) setItems(buildActions({ dashboard, alerts, bills }).slice(0, 3));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="triage-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="triage-title" className="text-base font-semibold text-slate-900">
            Do these 3 things today
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {loading && <p className="text-sm text-slate-500">Checking your books…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-slate-600">Nothing urgent today. You are clear.</p>
        )}

        <ol className="space-y-3">
          {items.map((item, i) => (
            <li key={item.key} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                {i + 1}
              </span>
              <div className="flex-1 text-sm text-slate-800">{item.text}</div>
              {item.clientId != null && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenClient?.(item.clientId);
                    onClose?.();
                  }}
                  className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open client
                </button>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
