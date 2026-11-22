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
import AnimatedCounter from "./AnimatedCounter";

const HORIZONS = [30, 60, 90];
const DEFAULT_BUFFER = 60000;

export default function CashForecastChart({ forecast, totals, settings }) {
  const [horizon, setHorizon] = useState(90);

  const buffer = settings?.min_cash_buffer ?? DEFAULT_BUFFER;
  const series = (forecast?.[horizon] || []).map((p) => ({ date: p.date, balance: p.balance }));

  const runsOut = series.find((p) => p.balance < 0);
  const dip = series.find((p) => p.balance < buffer);

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-300">
      {/* Header & Horizon Controls */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Cash Flow Forecast</h2>
          <p className="text-xs text-slate-500">
            Projected bank balance factoring reliability-weighted receivables and upcoming bills
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50/80 p-1">
          {HORIZONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setHorizon(d)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                horizon === d
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Cash Now" value={totals?.cash_now} sub="Opening balance" highlight />
        <StatCard label="In 30 Days" value={totals?.cash_30} sub="Net expected" />
        <StatCard label="In 60 Days" value={totals?.cash_60} sub="Net expected" />
        <StatCard label="In 90 Days" value={totals?.cash_90} sub="Net expected" />
      </div>

      {/* Warning Banners */}
      {runsOut ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800">
          <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
          <span>
            Cash runs out on <strong>{formatDate(runsOut.date)}</strong>. Chase overdue invoices or defer bills immediately.
          </span>
        </div>
      ) : dip ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
          <span>
            Cash dips below your safe <strong>{formatINR(buffer)}</strong> buffer on <strong>{formatDate(dip.date)}</strong>.
          </span>
        </div>
      ) : null}

      {/* Chart Canvas */}
      <div className="mt-2 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.28} />
                <stop offset="85%" stopColor="#818cf8" stopOpacity={0.05} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => formatDate(d)}
              minTickGap={28}
              tick={{ fontSize: 11, fill: "#64748b", fontFamily: "sans-serif" }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => shortINR(v)}
              width={60}
              tick={{ fontSize: 11, fill: "#64748b", fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={buffer}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `Buffer: ${shortINR(buffer)}`,
                fill: "#b45309",
                fontSize: 11,
                position: "insideTopRight",
                fontWeight: 600,
              }}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#4f46e5"
              strokeWidth={2.5}
              fill="url(#cashGradient)"
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function StatCard({ label, value, sub, highlight = false }) {
  return (
    <div className={`rounded-xl border p-3.5 transition-all ${highlight ? "border-indigo-100 bg-indigo-50/40" : "border-slate-200/80 bg-slate-50/60"}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-base font-bold text-slate-900">
        {value == null ? (
          "—"
        ) : (
          <>
            <span className="text-xs font-normal text-slate-400 mr-0.5">₹</span>
            <AnimatedCounter value={value} />
          </>
        )}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    return (
      <div className="rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur-sm">
        <div className="text-[11px] font-medium text-slate-400">{formatDate(label)}</div>
        <div className="mt-0.5 text-sm font-bold font-mono text-indigo-600">
          {formatINR(val)}
        </div>
      </div>
    );
  }
  return null;
}
