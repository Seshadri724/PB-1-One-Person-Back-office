import { useState } from "react";
import { Plus, RotateCcw, Zap } from "lucide-react";
import { resetDemo } from "../api";
import { formatDate } from "../utils/format";

export default function TopBar({ settings, onReload, onNewInvoice, onTriage }) {
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    setResetting(true);
    try {
      await resetDemo();
      await onReload?.();
    } catch (err) {
      window.alert(`Reset failed: ${err.message}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {settings?.business_name || "KhataFlow"}
        </h1>
        <p className="text-sm text-slate-500">
          {[settings?.city, formatDate(new Date())].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onNewInvoice}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> New invoice
        </button>
        <button
          type="button"
          onClick={onTriage}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Zap size={16} /> Bad day? Triage
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RotateCcw size={16} /> {resetting ? "Resetting…" : "Reset demo data"}
        </button>
      </div>
    </header>
  );
}
