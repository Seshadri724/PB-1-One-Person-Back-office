import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { deferBillLever, discountLever, getAlerts, getBills, getDashboard, getStaggeredChase } from "../api";
import { daysBetween, formatDate, formatINR } from "../utils/format";

// en-IN rupee format for lever amounts.
const rupees = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n) || 0);

// Local-time display for ISO timestamps; falls back to the raw value.
const formatLocalTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso ?? "") : d.toLocaleString("en-IN");
};

const TONE_LABEL = { friendly: "Friendly", firm: "Firm", final: "Final" };
const TONE_CLASS = {
  friendly: "bg-emerald-100 text-emerald-700",
  firm: "bg-amber-100 text-amber-800",
  final: "bg-red-100 text-red-700",
};

const SECONDARY_BTN =
  "min-h-[44px] rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

async function copyToClipboard(text) {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard is not available in this browser.");
  await navigator.clipboard.writeText(String(text ?? ""));
}

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
  const [bills, setBills] = useState([]);
  const [discountBusy, setDiscountBusy] = useState(false);
  const [discountError, setDiscountError] = useState("");
  const [discountResult, setDiscountResult] = useState(null);
  const [deferBusy, setDeferBusy] = useState(false);
  const [deferError, setDeferError] = useState("");
  const [deferResult, setDeferResult] = useState(null);
  const [deferBillId, setDeferBillId] = useState("");
  const [chaseBusy, setChaseBusy] = useState(false);
  const [chaseError, setChaseError] = useState("");
  const [chaseRows, setChaseRows] = useState([]);
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");

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
        if (!cancelled) {
          setItems(buildActions({ dashboard, alerts, bills }).slice(0, 3));
          setBills(bills || []);
          const firstUnpaid = (bills || []).find((b) => !b.paid);
          setDeferBillId(firstUnpaid ? String(firstUnpaid.id) : "");
        }
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

  const unpaidBills = bills.filter((b) => !b.paid);

  async function runDiscount() {
    setDiscountBusy(true);
    setDiscountError("");
    setDiscountResult(null);
    try {
      setDiscountResult(await discountLever({ discount_percent: 5, hours: 3 }));
    } catch (err) {
      setDiscountError(err.message);
    } finally {
      setDiscountBusy(false);
    }
  }

  async function runDefer() {
    const bill = unpaidBills.find((b) => String(b.id) === deferBillId);
    if (!bill) return;
    setDeferBusy(true);
    setDeferError("");
    setDeferResult(null);
    try {
      setDeferResult(await deferBillLever(bill.id, 7));
    } catch (err) {
      setDeferError(err.message);
    } finally {
      setDeferBusy(false);
    }
  }

  async function runChase() {
    setChaseBusy(true);
    setChaseError("");
    try {
      const res = await getStaggeredChase();
      const rows = Array.isArray(res) ? res : res?.items || res?.rows || [];
      setChaseRows(rows.slice(0, 3));
    } catch (err) {
      setChaseError(err.message);
    } finally {
      setChaseBusy(false);
    }
  }

  async function copy(key, text) {
    setCopyError("");
    try {
      await copyToClipboard(text);
      setCopied(key);
    } catch (err) {
      setCopyError(err.message);
    }
  }

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

        {loading && <p role="status" className="text-sm text-slate-500">Checking your books…</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-sm text-slate-600">Nothing urgent today. You are clear.</p>
        )}

        <ol className="space-y-3" aria-busy={loading}>
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
                  className="min-h-[44px] shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open client
                </button>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-5 space-y-5 border-t border-slate-200 pt-4">
          <section className="space-y-2" aria-busy={discountBusy}>
            <h3 className="text-sm font-semibold text-slate-900">Cash Acceleration</h3>
            <button
              type="button"
              onClick={runDiscount}
              disabled={discountBusy}
              className="min-h-[44px] rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {discountBusy ? "Preparing offer…" : "Offer 5% discount to top overdue client"}
            </button>
            {discountError && <p role="alert" className="text-sm text-red-600">{discountError}</p>}
            {discountResult && (
              <div aria-live="polite" className="space-y-1 rounded-lg border border-slate-200 p-3 text-sm text-slate-800">
                <p className="font-medium">
                  {discountResult.client_name} · {discountResult.invoice_number}
                </p>
                <p className="tabular-nums">
                  {rupees(discountResult.original_outstanding)} → {rupees(discountResult.discounted_amount)}
                </p>
                <p className="text-xs text-slate-500">
                  Valid until {formatLocalTime(discountResult.valid_until)}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => copy("whatsapp", discountResult.whatsapp_text)}
                    className={SECONDARY_BTN}
                  >
                    {copied === "whatsapp" ? "Copied" : "Copy WhatsApp text"}
                  </button>
                  <button
                    type="button"
                    onClick={() => copy("upi", discountResult.upi_link)}
                    className={SECONDARY_BTN}
                  >
                    {copied === "upi" ? "Copied" : "Copy UPI link"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-2" aria-busy={deferBusy}>
            <h3 className="text-sm font-semibold text-slate-900">Cash Preservation</h3>
            {unpaidBills.length === 0 ? (
              <button
                type="button"
                disabled
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select a bill in Bills to defer.
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="defer-bill" className="text-xs font-medium text-slate-700">
                  Bill to defer
                </label>
                <select
                  id="defer-bill"
                  value={deferBillId}
                  onChange={(e) => setDeferBillId(e.target.value)}
                  disabled={deferBusy}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs tabular-nums text-slate-700"
                >
                  {unpaidBills.map((b) => (
                    <option key={b.id} value={String(b.id)}>
                      {b.name} · {rupees(b.amount)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={runDefer}
                  disabled={deferBusy || !deferBillId}
                  className="min-h-[44px] rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deferBusy ? "Deferring…" : "Defer payout by 7 days"}
                </button>
              </div>
            )}
            {deferError && <p role="alert" className="text-sm text-red-600">{deferError}</p>}
            {deferResult && (
              <div aria-live="polite" className="space-y-1 rounded-lg border border-slate-200 p-3 text-sm text-slate-800">
                {deferResult.bill?.next_due_date && (
                  <p>New due date: {formatDate(deferResult.bill.next_due_date)}</p>
                )}
                {deferResult.runway?.safe_runway_days != null && (
                  <p>Safe runway: {deferResult.runway.safe_runway_days} days</p>
                )}
              </div>
            )}
          </section>

          <section className="space-y-2" aria-busy={chaseBusy}>
            <h3 className="text-sm font-semibold text-slate-900">Staggered Chase</h3>
            <button
              type="button"
              onClick={runChase}
              disabled={chaseBusy}
              className="min-h-[44px] rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {chaseBusy ? "Loading…" : "Load staggered chase"}
            </button>
            {chaseError && <p role="alert" className="text-sm text-red-600">{chaseError}</p>}
            {chaseRows.length > 0 && (
              <ul className="space-y-2" aria-live="polite">
                {chaseRows.map((r, i) => {
                  const tone = String(r.tone ?? "").toLowerCase();
                  const key = `chase-${i}`;
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm text-slate-800"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.client_name}</p>
                        <p className="text-xs tabular-nums text-slate-500">
                          {r.days_late} days late · {rupees(r.outstanding)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          TONE_CLASS[tone] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {TONE_LABEL[tone] ?? r.tone}
                      </span>
                      <button type="button" onClick={() => copy(key, r.message)} className={SECONDARY_BTN}>
                        {copied === key ? "Copied" : "Copy message"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {copyError && <p role="alert" className="text-sm text-red-600">{copyError}</p>}
        </div>
      </div>
    </div>
  );
}
