import { useCallback, useEffect, useState } from "react";
import { Plus, Receipt, RotateCcw, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { getRunway, resetDemo } from "../api";
import { formatDate } from "../utils/format";
import ReconcileModal from "./ReconcileModal";

const DEFAULT_RUNWAY_NOTE =
  "Based on expected receivables weighted by client reliability minus upcoming fixed bills.";

const RUNWAY_STATUS = {
  healthy: {
    label: "Healthy",
    pillClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
    pingClass: "bg-emerald-400",
  },
  caution: {
    label: "Caution",
    pillClass: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
    pingClass: "bg-amber-400",
  },
  critical: {
    label: "Critical",
    pillClass: "bg-rose-50 text-rose-700 border-rose-200",
    dotClass: "bg-rose-500",
    pingClass: "bg-rose-400",
  },
};

function formatSafeRunway(days) {
  if (days === null || days === undefined) return "365+ days";
  if (days === 0) return "Below buffer now";
  return `${days} days`;
}

function formatZeroCashRunway(days) {
  if (days === null || days === undefined) return "365+ days";
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
  const statusCfg = runway ? (RUNWAY_STATUS[runway.status] || RUNWAY_STATUS.healthy) : null;
  const barValue = runway ? Math.min(runway.safe_runway_days ?? 365, 90) : 0;
  const barPercent = (barValue / 90) * 100;
  const runwayLabel = runway
    ? `Safe runway ${formatSafeRunway(runway.safe_runway_days)}, zero-cash runway ${formatZeroCashRunway(runway.zero_cash_runway_days)}`
    : undefined;

  return (
    <header className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Brand identity */}
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {settings?.business_name || "KhataFlow"}
            </h1>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              Back Office
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {[settings?.city, formatDate(new Date())].filter(Boolean).join(" · ")}
          </p>
        </div>

        {/* Runway Health Pill */}
        <div className="group relative" tabIndex={0} title={note} role="status" aria-label={runwayLabel}>
          <div className="min-w-[260px] rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 transition-colors hover:border-slate-300">
            {runway ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500">
                    Safe runway:{" "}
                    <span className="font-bold text-slate-900">
                      {formatSafeRunway(runway.safe_runway_days)}
                    </span>
                  </span>
                  {statusCfg && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusCfg.pillClass}`}>
                      <span className="relative flex h-2 w-2">
                        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${statusCfg.pingClass}`} />
                        <span className={`relative inline-flex h-2 w-2 rounded-full ${statusCfg.dotClass}`} />
                      </span>
                      {statusCfg.label}
                    </span>
                  )}
                </div>
                <div
                  role="progressbar"
                  aria-label="Safe runway progress"
                  aria-valuenow={barValue}
                  aria-valuemin={0}
                  aria-valuemax={90}
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
                >
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${barPercent}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Zero-cash: {formatZeroCashRunway(runway.zero_cash_runway_days)}</span>
                  <span>Buffer: ₹{Number(settings?.min_cash_buffer || 60000).toLocaleString("en-IN")}</span>
                </div>
              </>
            ) : (
              <p className="py-2 text-xs text-slate-400" aria-live="polite">
                {runwayFailed ? "Runway unavailable" : "Calculating cash runway…"}
              </p>
            )}
          </div>
          <div
            role="tooltip"
            className="pointer-events-none absolute left-0 top-full z-20 mt-1 w-72 rounded-lg bg-slate-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {note}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onNewInvoice}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:from-indigo-500 hover:to-indigo-600"
          >
            <Plus size={16} /> New invoice
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={onTriage}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 hover:border-amber-300"
          >
            <Zap size={16} className="text-amber-600 fill-amber-500" /> Bad day? Triage
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => setShowReconcile(true)}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-card transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <Receipt size={16} className="text-slate-500" /> Quick Reconcile
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-card transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
          >
            <RotateCcw size={15} className={`text-slate-400 ${resetting ? "animate-spin" : ""}`} />
            {resetting ? "Resetting…" : "Reset demo"}
          </motion.button>
        </div>
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
