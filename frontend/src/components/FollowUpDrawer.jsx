import { useEffect, useState } from "react";
import { Copy, Link2, MessageCircle, X } from "lucide-react";
import { addFollowup, getFollowups, getInvoices, getReminder, getSettings } from "../api";
import { formatDate } from "../utils/format";
import UpiQr from "./UpiQr.jsx";
import { buildUpiUri } from "../lib/upiQr.js";

const TONES = [
  { value: "friendly", label: "Friendly" },
  { value: "firm", label: "Firm" },
  { value: "final", label: "Final" },
];

// Swap the message inside a wa.me-style link (?text=...) so edits are sent.
function withMessage(url, message) {
  try {
    const u = new URL(url);
    u.searchParams.set("text", message);
    return u.toString();
  } catch {
    return url;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// API dates are YYYY-MM-DD; the slip shows DD-MMM-YYYY, or "On receipt" when unset.
function formatSlipDate(value) {
  if (!value) return "On receipt";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return String(value);
  return `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}`;
}

const formatINR = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function FollowUpDrawer({ client, onClose, onSent }) {
  const clientId = client?.id;
  const [tone, setTone] = useState("friendly");
  const [reminder, setReminder] = useState(null);
  const [text, setText] = useState("");
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState(null);
  const [amountMode, setAmountMode] = useState("full");
  const [customInput, setCustomInput] = useState(null);
  const [slipCopied, setSlipCopied] = useState(false);

  // Escape closes the drawer.
  useEffect(() => {
    if (clientId == null) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clientId, onClose]);

  // Reset tone and load past follow-ups when a new client opens.
  useEffect(() => {
    if (clientId == null) return;
    setTone("friendly");
    setStatus("");
    setError("");
    getFollowups(clientId)
      .then((rows) => setHistory(rows || []))
      .catch((err) => setError(err.message));
  }, [clientId]);

  // Load settings (UPI ID, business name) and invoices for the QR and WhatsApp slip.
  useEffect(() => {
    if (clientId == null) return;
    setAmountMode("full");
    setCustomInput(null);
    setSlipCopied(false);
    getSettings()
      .then(setSettings)
      .catch((err) => setError(err.message));
    getInvoices()
      .then((rows) => setInvoices(rows || []))
      .catch((err) => setError(err.message));
  }, [clientId]);

  // "Copied" feedback lasts 2 seconds.
  useEffect(() => {
    if (!slipCopied) return undefined;
    const t = setTimeout(() => setSlipCopied(false), 2000);
    return () => clearTimeout(t);
  }, [slipCopied]);

  // Fetch the drafted reminder whenever client or tone changes.
  useEffect(() => {
    if (clientId == null) return;
    let cancelled = false;
    setReminder(null);
    getReminder(clientId, tone)
      .then((r) => {
        if (cancelled) return;
        setReminder(r);
        setText(r.message || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, tone]);

  if (!client) return null;

  // Same invoice the reminder targets: the open one that is most overdue.
  const openInvoices = invoices.filter(
    (i) => i.client_id === clientId && i.status !== "draft" && i.outstanding > 0,
  );
  const target = openInvoices.reduce(
    (best, i) => (best === null || i.days_overdue > best.days_overdue ? i : best),
    null,
  );
  const outstanding = target ? Number(target.outstanding) : 0;
  const customValue = customInput ?? String(outstanding);
  const customParsed = Number(customValue);
  const customValid = Number.isFinite(customParsed) && customParsed > 0;
  // Custom falls back to outstanding while the entered value is not a positive number.
  const amount = amountMode === "custom" && customValid ? customParsed : outstanding;
  const businessName = settings?.business_name ?? "";
  const upiUri = target && settings
    ? buildUpiUri({ upiId: settings.upi_id, payeeName: businessName, amount, invoiceNumber: target.number })
    : "";

  function buildSlip() {
    const lines = [
      `*${businessName}* - Payment Reminder`,
      `Invoice: *${target.number}*`,
      `Gross: ₹${formatINR(target.gross_amount)}`,
    ];
    if (Number(target.tds_amount) > 0) lines.push(`TDS deducted (if any): ₹${formatINR(target.tds_amount)}`);
    if (Number(target.gst_amount) > 0) lines.push(`GST (if any): ₹${formatINR(target.gst_amount)}`);
    lines.push(
      `*Net due: ₹${formatINR(amount)}*`,
      `Due date: ${formatSlipDate(target.due_date)}`,
      `UPI ID: *${settings.upi_id}*`,
      `Pay link: ${upiUri}`,
    );
    return lines.join("\n");
  }

  async function copySlip() {
    try {
      await navigator.clipboard.writeText(buildSlip());
      setSlipCopied(true);
    } catch {
      setError("Could not access the clipboard.");
    }
  }

  async function logFollowup(channel) {
    await addFollowup(clientId, { channel, tone, note: text });
    const rows = await getFollowups(clientId);
    setHistory(rows || []);
  }

  async function handleOpenWhatsApp() {
    if (!reminder?.whatsapp_url) return;
    setError("");
    window.open(withMessage(reminder.whatsapp_url, text), "_blank", "noopener");
    try {
      await logFollowup("whatsapp");
      setStatus("Logged as sent.");
      onSent?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function copy(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(`${label} copied.`);
    } catch {
      setError("Could not access the clipboard.");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Follow up with ${client.name}`}
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{client.name}</h2>
            {client.company && <p className="text-sm text-slate-500">{client.company}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 px-5 py-4">
          <div>
            <span className="mb-2 block text-sm text-slate-600">Tone</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTone(t.value)}
                  className={`rounded-md px-3 py-1 font-medium ${
                    tone === t.value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Message (editable)</span>
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!reminder}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              disabled={!reminder}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <MessageCircle size={16} /> Open WhatsApp
            </button>
            <button
              type="button"
              onClick={() => copy(text, "Message")}
              disabled={!text}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Copy size={16} /> Copy message
            </button>
            {reminder?.upi_link && (
              <button
                type="button"
                onClick={() => copy(reminder.upi_link, "UPI link")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Link2 size={16} /> Copy UPI link
              </button>
            )}
            {target && settings && (
              <button
                type="button"
                onClick={copySlip}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Copy size={16} /> {slipCopied ? "Copied" : "Copy WhatsApp Slip"}
              </button>
            )}
            <span className="sr-only" aria-live="polite">
              {slipCopied ? "Copied" : ""}
            </span>
          </div>

          {target && settings && (
            <div className="space-y-2">
              <span className="block text-sm text-slate-600">UPI QR · {target.number}</span>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
                {[
                  { value: "full", label: "Full amount" },
                  { value: "custom", label: "Custom amount" },
                ].map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setAmountMode(m.value)}
                    aria-pressed={amountMode === m.value}
                    className={`min-h-[44px] rounded-md px-3 py-1 font-medium ${
                      amountMode === m.value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {amountMode === "custom" && (
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-600">Amount (₹)</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={customValue}
                    onChange={(e) => setCustomInput(e.target.value)}
                    className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              )}
              {amountMode === "custom" && !customValid && (
                <p className="text-xs text-amber-600" aria-live="polite">
                  Enter an amount above zero. The QR uses the outstanding ₹{formatINR(outstanding)} until then.
                </p>
              )}
              <UpiQr
                value={upiUri}
                aria-label={`UPI payment QR code for ${target.number}, amount ₹${formatINR(amount)}`}
              />
              <p className="text-sm tabular-nums text-slate-700">Amount: ₹{formatINR(amount)}</p>
            </div>
          )}

          {status && <p aria-live="polite" className="text-sm text-emerald-600">{status}</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Past follow-ups</h3>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">No follow-ups logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((f) => (
                  <li key={f.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <div className="flex justify-between text-xs text-slate-500">
                      <span className="capitalize">{f.channel} · {f.tone}</span>
                      <span>{formatDate(f.created_at)}</span>
                    </div>
                    {f.note && <p className="mt-1 whitespace-pre-line text-slate-700">{f.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
