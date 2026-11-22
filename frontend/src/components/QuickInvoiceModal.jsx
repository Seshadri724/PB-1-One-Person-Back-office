import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createInvoice, getClients } from "../api";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function QuickInvoiceModal({ open, onClose, onCreated }) {
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    client_id: "",
    description: "",
    amount: "",
    issued_date: todayISO(),
    due_date: plusDaysISO(15),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Load clients for the structured form when opened.
  useEffect(() => {
    if (!open) return;
    setError("");
    getClients()
      .then((rows) => setClients(rows || []))
      .catch((err) => setError(err.message));
  }, [open]);

  if (!open) return null;

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function submit(payload) {
    setError("");
    setBusy(true);
    try {
      const created = await createInvoice(payload);
      onCreated?.(created);
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleTextSubmit(e) {
    e.preventDefault();
    if (text.trim().length < 3) {
      setError("Describe the invoice in a few words.");
      return;
    }
    submit({ text: text.trim() });
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    if (!form.client_id) {
      setError("Pick a client.");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Amount must be a whole rupee amount above zero.");
      return;
    }
    submit({
      client_id: Number(form.client_id),
      description: form.description,
      amount,
      issued_date: form.issued_date,
      due_date: form.due_date,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-invoice-title"
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="quick-invoice-title" className="text-base font-semibold text-slate-900">
            New invoice
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

        <div className="mb-4 inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
          {[
            { value: "text", label: "One line" },
            { value: "form", label: "Structured form" },
          ].map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => {
                setMode(m.value);
                setError("");
              }}
              className={`rounded-md px-3 py-1 font-medium ${
                mode === m.value ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "text" ? (
          <form onSubmit={handleTextSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Describe the invoice in one line</span>
              <textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Logo design for Zenith Foods 35k due in 15 days"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <p className="text-xs text-slate-500">
              Example: "Logo design for Zenith Foods 35k due in 15 days"
            </p>
            <ModalFooter busy={busy} error={error} onClose={onClose} />
          </form>
        ) : (
          <form onSubmit={handleFormSubmit} className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">Client</span>
              <select
                value={form.client_id}
                onChange={(e) => setField("client_id", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.company ? ` (${c.company})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-slate-600">Description</span>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Amount (₹)</span>
              <input
                type="number"
                min={1}
                value={form.amount}
                onChange={(e) => setField("amount", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Due date</span>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setField("due_date", e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="sm:col-span-2">
              <ModalFooter busy={busy} error={error} onClose={onClose} />
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ModalFooter({ busy, error, onClose }) {
  return (
    <>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create invoice"}
        </button>
      </div>
    </>
  );
}
