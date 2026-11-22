import { useEffect, useState } from "react";
import { Copy, Link2, MessageCircle, X } from "lucide-react";
import { addFollowup, getFollowups, getReminder } from "../api";
import { formatDate } from "../utils/format";

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

export default function FollowUpDrawer({ client, onClose, onSent }) {
  const clientId = client?.id;
  const [tone, setTone] = useState("friendly");
  const [reminder, setReminder] = useState(null);
  const [text, setText] = useState("");
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

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
          </div>

          {status && <p className="text-sm text-emerald-600">{status}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

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
