import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatINR, shortINR } from "../utils/format";

const HORIZONS = [30, 60, 90];
// Used when no settings object is passed in (documented fallback).
const DEFAULT_BUFFER = 60000;

/**
 * forecast: dashboard.forecast -> { 30: [...], 60: [...], 90: [...] }, each item { date, balance, inflow, outflow }
 * totals:   dashboard.totals -> { cash_now, cash_30, cash_60, cash_90, ... }
 * settings: optional; if given, settings.min_cash_buffer is the chart reference line
 */
export default function CashForecastChart({ forecast, totals, settings }) {
  const [horizon, setHorizon] = useState(90);

  const buffer = settings?.min_cash_buffer ?? DEFAULT_BUFFER;
  const series = (forecast?.[horizon] || []).map((p) => ({ date: p.date, balance: p.balance }));

  const runsOut = series.find((p) => p.balance < 0);
  const dip = series.find((p) => p.balance < buffer);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Cash forecast</h2>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
          {HORIZONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setHorizon(d)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                horizon === d ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cash now" value={totals?.cash_now} />
        <Stat label="In 30 days" value={totals?.cash_30} />
        <Stat label="In 60 days" value={totals?.cash_60} />
        <Stat label="In 90 days" value={totals?.cash_90} />
      </div>

      {runsOut ? (
        <Warning>Cash runs out on {formatDate(runsOut.date)}. Chase payments or defer a bill now.</Warning>
      ) : dip ? (
        <Warning>
          Cash dips below the {formatINR(buffer)} buffer on {formatDate(dip.date)}.
        </Warning>
      ) : null}

      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => formatDate(d)}
              minTickGap={32}
              tick={{ fontSize: 11, fill: "#64748b" }}
            />
            <YAxis
              tickFormatter={(v) => shortINR(v)}
              width={64}
              tick={{ fontSize: 11, fill: "#64748b" }}
            />
            <Tooltip
              formatter={(v) => formatINR(v)}
              labelFormatter={(d) => formatDate(d)}
            />
            <ReferenceLine
              y={buffer}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{ value: "Buffer", fill: "#b45309", fontSize: 11, position: "insideTopRight" }}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#4f46e5"
              strokeWidth={2}
              fill="url(#cashFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-slate-900">
        {value == null ? "—" : formatINR(value)}
      </div>
    </div>
  );
}

function Warning({ children }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
      {children}
    </div>
  );
}
