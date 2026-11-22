import { useCallback, useEffect, useState } from "react";
import { Plus, Receipt, RotateCcw, Zap } from "lucide-react";
import { getRunway, resetDemo } from "../api";
import { formatDate } from "../utils/format";
import ReconcileModal from "./ReconcileModal";

const DEFAULT_RUNWAY_NOTE =
  "Based on expected receivables weighted by client reliability minus upcoming fixed bills.";

const RUNWAY_STATUS = {
  healthy: { label: "🟢 Healthy", className: "bg-green-100 text-green-700" },
  caution: { label: "🟡 Caution", className: "bg-amber-100 text-amber-700" },
  critical: { label: "🔴 Critical", className: "bg-red-100 text-red-700" },
};

function formatSafeRunway(days) {
  if (days === null || days === undefined) return "Not within 365 days";
  if (days === 0) return "Below buffer now";
  return `${days} days`;
}

function formatZeroCashRunway(days) {
  if (days === null || days === undefined) return "Not within 365 days";
  return `${days} days`;
}

export default function TopBar({ settings, onReload, onNewInvoice, onTriage }) {
  const [resetting, setResetting] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  const [runway, setRunway] = useState(null);
  const [runwayFailed, setRunwayFailed] = useState(false);

  const fetchRunway = useCallback(async () => {
    try {
      setRunway(await getRunway());
      setRunwayFailed(false);
    } catch {
      setRunwayFailed(true);
    }
  }, []);

  useEffect(() => {
    fetchRunway();
    const timer = setInterval(fetchRunway, 60000);
    return () => clearInterval(timer);
  }, [fetchRunway]);

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

  const note = runway?.formula_note || DEFAULT_RUNWAY_NOTE;
  const badge = runway ? RUNWAY_STATUS[runway.status] : null;
  const barValue = runway ? Math.min(runway.safe_runway_days ?? 365, 90) : 0;
  const barPercent = (barValue / 90) * 100;
  const runwayLabel = runway
    ? `Safe runway ${formatSafeRunway(runway.safe_runway_days)}, zero-cash runway ${formatZeroCashRunway(runway.zero_cash_runway_days)}`
    : undefined;

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
      <div className="group relative" tabIndex={0} title={note} role="status" aria-label={runwayLabel}>
        <div className="min-w-[240px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          {runway ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  Safe runway{" "}
                  <span className="font-semibold text-slate-900">
                    {formatSafeRunway(runway.safe_runway_days)}
                  </span>
                </span>
                {badge && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                )}
              </div>
              <div
                role="progressbar"
                aria-label="Safe runway progress"
                aria-valuenow={barValue}
                aria-valuemin={0}
                aria-valuemax={90}
                className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
              >
                <div className="h-full bg-indigo-500" style={{ width: `${barPercent}%` }} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Zero-cash runway{" "}
                <span className="font-medium text-slate-700">
                  {formatZeroCashRunway(runway.zero_cash_runway_days)}
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400" aria-live="polite">
              {runwayFailed ? "Runway unavailable" : "Loading runway…"}
            </p>
          )}
        </div>
        <div
          role="tooltip"
          tabIndex={0}
          className="pointer-events-none absolute left-0 top-full z-10 mt-1 w-72 rounded-md bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity motion-reduce:transition-none group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {note}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onNewInvoice}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> New invoice
        </button>
        <button
          type="button"
          onClick={onTriage}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Zap size={16} /> Bad day? Triage
        </button>
        <button
          type="button"
          onClick={() => setShowReconcile(true)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Receipt size={16} /> Quick Reconcile
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RotateCcw size={16} /> {resetting ? "Resetting…" : "Reset demo data"}
        </button>
      </div>
      {showReconcile && (
        <ReconcileModal
          onClose={() => setShowReconcile(false)}
          onReconciled={() => {
            fetchRunway();
            onReload?.();
          }}
        />
      )}
    </header>
  );
}
