import { useEffect, useState } from "react";
import { Check, Copy, Link2, MessageCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { addFollowup, getFollowups, getInvoices, getReminder, getSettings } from "../api";
import { formatDate } from "../utils/format";
import UpiQr from "./UpiQr.jsx";
import { buildUpiUri } from "../lib/upiQr.js";

const TONES = [
  { value: "friendly", label: "Friendly" },
  { value: "firm", label: "Firm" },
  { value: "final", label: "Final" },
];

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

function formatSlipDate(value) {
  if (!value) return "On receipt";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return String(value);
  return `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}`;
}

const formatINR = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const APP_BADGES = [
  { label: "GPay", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  { label: "PhonePe", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  { label: "Paytm", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  { label: "BHIM", cls: "bg-orange-50 text-orange-700 border-orange-200" },
];

export default function FollowUpDrawer({ client, onClose, onSent }) {
  const clientId = client?.client_id ?? client?.id;
  const clientName = client?.client_name ?? client?.name ?? "Client";
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
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    if (clientId == null) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clientId, onClose]);

  useEffect(() => {
    if (clientId == null) return;
    setTone("friendly");
    setStatus("");
    setError("");
    getFollowups(clientId)
      .then((rows) => setHistory(rows || []))
      .catch((err) => setError(err.message));
  }, [clientId]);

  useEffect(() => {
    if (clientId == null) return;
    setAmountMode("full");
    setCustomInput(null);
    getSettings()
      .then(setSettings)
      .catch((err) => setError(err.message));
    getInvoices()
      .then((rows) => setInvoices(rows || []))
      .catch((err) => setError(err.message));
  }, [clientId]);

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

  const openInvoices = invoices.filter(
    (i) => i.client_id === clientId && i.status !== "draft" && i.outstanding > 0,
  );
  const target = openInvoices.reduce(
    (best, i) => (best === null || i.days_overdue > best.days_overdue ? i : best),
    null,
  );
  const outstanding = target ? Number(target.outstanding) : 0;
  const customValue = customInput ?? String(outstanding);
  const customAmount = Number(customValue);
  const customValid = Number.isFinite(customAmount) && customAmount > 0;
  const amount = amountMode === "custom" && customValid ? Math.round(customAmount) : outstanding;

  const businessName = settings?.business_name || "PixelCraft Studio";
  const upiUri = target && settings
    ? buildUpiUri({ upiId: settings.upi_id, payeeName: businessName, amount, invoiceNumber: target.number })
    : "";

  function buildSlip() {
    if (!target || !settings) return "";
    const lines = [
      `🧾 *INVOICE PAYMENT SUMMARY · ${businessName}*`,
      `Client: ${clientName}${client.company ? ` (${client.company})` : ""}`,
      `Invoice: *${target.number}*`,
      `Gross: ₹${formatINR(target.gross_amount)}`,
    ];
    if (Number(target.tds_amount) > 0) lines.push(`TDS deducted (if any): ₹${formatINR(target.tds_amount)}`);
    if (Number(target.gst_amount) > 0) lines.push(`GST (if any): ₹${formatINR(target.gst_amount)}`);
    lines.push(
      `Amount due: *₹${formatINR(amount)}*`,
      `Due date: ${formatSlipDate(target.due_date)}`,
      `Pay via UPI: *${settings.upi_id}*`,
      `Direct link: ${upiUri}`,
    );
    return lines.join("\n");
  }

  function triggerCelebration(msg) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 2200);
    try {
      confetti({
        particleCount: 28,
        spread: 60,
        origin: { y: 0.85, x: 0.8 },
        colors: ["#4f46e5", "#10b981", "#f59e0b"],
      });
    } catch {
      // safe fallback if canvas is restricted
    }
  }

  async function copyToClipboard(val, label) {
    try {
      await navigator.clipboard.writeText(val);
      triggerCelebration(`${label} copied!`);
    } catch {
      setError("Could not access clipboard.");
    }
  }

  async function handleOpenWhatsApp() {
    if (!reminder?.whatsapp_url) return;
    setError("");
    window.open(withMessage(reminder.whatsapp_url, text), "_blank", "noopener");
    try {
      await addFollowup(clientId, { channel: "whatsapp", tone, note: text });
      const rows = await getFollowups(clientId);
      setHistory(rows || []);
      setStatus("Logged as sent.");
      onSent?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-[2px]"
      />

      {/* Drawer Container */}
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 26, stiffness: 260 }}
        role="dialog"
        aria-modal="true"
        aria-label={`Follow up with ${clientName}`}
        className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{clientName}</h2>
            {client.company && <p className="text-xs text-slate-500">{client.company}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 space-y-5 p-6">
          {/* Tone Selector */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
              Message Tone
            </span>
            <div className="grid grid-cols-3 gap-2">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTone(t.value)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition-all ${
                    tone === t.value
                      ? "border-indigo-600 bg-indigo-50/70 text-indigo-700 shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Drafted Message Area */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Drafted WhatsApp Reminder
            </label>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Loading reminder..."
              className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-relaxed text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
            />
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleOpenWhatsApp}
              disabled={!reminder}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <MessageCircle size={15} /> Open WhatsApp
            </button>
            <button
              type="button"
              onClick={() => copyToClipboard(text, "Message")}
              disabled={!text}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Copy size={14} /> Copy text
            </button>
            {target && settings && (
              <button
                type="button"
                onClick={() => copyToClipboard(buildSlip(), "WhatsApp slip")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100/70 transition-colors"
              >
                <Copy size={14} /> Copy WhatsApp Slip
              </button>
            )}
          </div>

          {/* UPI QR & Payment Link Card */}
          {target && settings && (
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Dynamic UPI QR Code</span>
                  <span className="text-[11px] text-slate-500">Invoice {target.number}</span>
                </div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setAmountMode("full")}
                    className={`rounded-md px-2.5 py-1 ${amountMode === "full" ? "bg-indigo-600 text-white" : "text-slate-600"}`}
                  >
                    Full (₹{formatINR(outstanding)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountMode("custom")}
                    className={`rounded-md px-2.5 py-1 ${amountMode === "custom" ? "bg-indigo-600 text-white" : "text-slate-600"}`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {amountMode === "custom" && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">Amount: ₹</span>
                  <input
                    type="number"
                    min="1"
                    value={customValue}
                    onChange={(e) => setCustomInput(e.target.value)}
                    className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
              )}

              {/* Scannable QR Component */}
              <div className="flex flex-col items-center justify-center rounded-xl bg-white p-4 border border-slate-100 shadow-sm">
                <UpiQr value={upiUri} />
                <div className="mt-3 flex items-center gap-1.5">
                  {APP_BADGES.map((b) => (
                    <span key={b.label} className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${b.cls}`}>
                      {b.label}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-center text-xs font-bold text-slate-900 font-mono">
                  ₹{formatINR(amount)}
                </div>
              </div>

              {/* Copy UPI Link Button */}
              {reminder?.upi_link && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(reminder.upi_link, "UPI link")}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <Link2 size={14} /> Copy direct UPI payment link
                </button>
              )}
            </div>
          )}

          {status && <p className="text-xs font-medium text-emerald-600">{status}</p>}
          {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

          {/* Past Follow-Up History */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Audit Trail · Past Follow-ups
            </h3>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400">No follow-ups logged yet for this client.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((f) => (
                  <li key={f.id} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-2.5 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-semibold capitalize text-slate-700">
                        {f.channel} · {f.tone}
                      </span>
                      <span>{formatDate(f.created_at)}</span>
                    </div>
                    {f.note && <p className="mt-1 line-clamp-2 text-slate-600 leading-normal">{f.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Floating Copied Toast */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="fixed bottom-6 right-8 z-50 flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-xl"
            >
              <Check size={14} className="text-emerald-400" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.aside>
    </div>
  );
}
