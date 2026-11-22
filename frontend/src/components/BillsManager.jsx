import { useCallback, useEffect, useState } from "react";
import { Plus, Receipt } from "lucide-react";
import { createBill, getBills, updateBill } from "../api";
import { formatDate, formatINR } from "../utils/format";

const CATEGORIES = ["rent", "software", "contractor", "utilities", "other"];

const CATEGORY_CHIP = {
  rent: "bg-violet-100 text-violet-700",
  software: "bg-sky-100 text-sky-700",
  contractor: "bg-amber-100 text-amber-700",
  utilities: "bg-emerald-100 text-emerald-700",
  other: "bg-slate-100 text-slate-700",
};

const EMPTY_FORM = { name: "", category: "software", amount: "", due_day: "1", recurring: true };

export default function BillsManager({ onChanged }) {
  const [bills, setBills] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const rows = await getBills();
    setBills(rows || []);
  }, []);

  useEffect(() => {
    reload().catch((err) => setError(err.message));
  }, [reload]);

  async function handleTogglePaid(bill, paid) {
    setError("");
    try {
      await updateBill(bill.id, paid);
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    const amount = Number(form.amount);
    const dueDay = Number(form.due_day);
    if (!form.name.trim()) {
      setError("Give the bill a name.");
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Amount must be a whole rupee amount above zero.");
      return;
    }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      setError("Due day must be between 1 and 31.");
      return;
    }
    setBusy(true);
    try {
      await createBill({
        name: form.name.trim(),
        category: form.category,
        amount,
        due_day: dueDay,
        recurring: form.recurring,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Unpaid bills whose next due date falls in the current calendar month.
  const nowYM = new Date().toISOString().slice(0, 7);
  const totalDueThisMonth = bills
    .filter((b) => !b.paid && String(b.next_due_date).slice(0, 7) === nowYM)
    .reduce((sum, b) => sum + b.amount, 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Receipt size={18} className="text-indigo-600" /> Bills
          </h2>
          <p className="text-sm text-slate-500">
            Total due this month: <strong className="text-slate-900">{formatINR(totalDueThisMonth)}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Plus size={16} /> Add bill
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="mb-4 grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-5">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">Name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Category</span>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Amount (₹)</span>
            <input
              type="number"
              min={1}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Due day</span>
            <input
              type="number"
              min={1}
              max={31}
              value={form.due_day}
              onChange={(e) => setForm({ ...form, due_day: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 self-end text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
            />
            Monthly
          </label>
          <div className="flex justify-end gap-2 sm:col-span-5">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save bill"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {bills.length === 0 ? (
        <p className="text-sm text-slate-500">No bills yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {bills.map((bill) => (
            <li key={bill.id} className="flex flex-wrap items-center gap-3 py-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={bill.paid}
                  onChange={(e) => handleTogglePaid(bill, e.target.checked)}
                  aria-label={`Mark ${bill.name} as paid`}
                  className="h-4 w-4"
                />
                <span className={`text-sm font-medium ${bill.paid ? "text-slate-400 line-through" : "text-slate-900"}`}>
                  {bill.name}
                </span>
              </label>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORY_CHIP[bill.category] || CATEGORY_CHIP.other}`}>
                {bill.category}
              </span>
              <span className="ml-auto text-sm tabular-nums text-slate-900">{formatINR(bill.amount)}</span>
              <span className="w-28 text-right text-xs text-slate-500">
                Due {formatDate(bill.next_due_date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
