import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { getClients, whatIf } from "../api";
import { formatDate, formatINR } from "../utils/format";

const TYPES = [
  { value: "client_late", label: "Client pays late" },
  { value: "new_retainer", label: "New monthly retainer" },
  { value: "drop_client", label: "Drop a client" },
];

export default function WhatIfPanel({ onApplied }) {
  const [clients, setClients] = useState([]);
  const [type, setType] = useState("client_late");
  const [clientId, setClientId] = useState("");
  const [days, setDays] = useState(30);
  const [amount, setAmount] = useState(50000);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getClients()
      .then((rows) => setClients(rows || []))
      .catch((err) => setError(err.message));
  }, []);

  const needsClient = type === "client_late" || type === "drop_client";

  function buildScenario() {
    if (needsClient) {
      const scenario = { type, client_id: Number(clientId) };
      if (type === "client_late") scenario.days = Number(days);
      return scenario;
    }
    return { type, days: Number(days), amount: Number(amount), monthly: true };
  }

  function validate() {
    if (needsClient && !clientId) return "Pick a client first.";
    if (type === "new_retainer" && !(Number(amount) > 0)) return "Enter the monthly amount.";
    if (type === "client_late" && !(Number(days) > 0)) return "Enter how many extra days late.";
    return "";
  }

  async function handleRun() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await whatIf({ scenarios: [buildScenario()] });
      setResult(res);
      onApplied?.(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-300">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <FlaskConical size={18} className="text-indigo-600" /> What If… Cash Sandbox
        </h2>
        <p className="text-xs text-slate-500">
          Simulate payment delays, retainers, or client churn to see how your runway reacts
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Scenario</span>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setResult(null);
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>

        {needsClient && (
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Client</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        {type === "client_late" && (
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Extra days late</span>
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        )}

        {type === "new_retainer" && (
          <>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Monthly amount (₹)</span>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">Starts in (days)</span>
              <input
                type="number"
                min={0}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={busy}
        className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {busy ? "Running…" : "Run scenario"}
      </button>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && <Result result={result} />}
    </section>
  );
}

function Result({ result }) {
  const b = result.baseline;
  const s = result.scenario;
  const d = result.delta;

  let runsOutText;
  if (!d.runs_out_date_changed) {
    runsOutText = b.runs_out_date
      ? `Cash still runs out on ${formatDate(b.runs_out_date)} either way.`
      : "Cash does not run out in the next 90 days, with or without this change.";
  } else if (s.runs_out_date && !b.runs_out_date) {
    runsOutText = `This makes cash run out on ${formatDate(s.runs_out_date)}, which does not happen today.`;
  } else if (!s.runs_out_date && b.runs_out_date) {
    runsOutText = `This avoids the run-out on ${formatDate(b.runs_out_date)}.`;
  } else {
    runsOutText = `The run-out date moves from ${formatDate(b.runs_out_date)} to ${formatDate(s.runs_out_date)}.`;
  }

  const sign = d.min_balance >= 0 ? "+" : "−";

  return (
    <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
      <p>
        Lowest balance goes from <strong>{formatINR(b.min_balance)}</strong> to{" "}
        <strong>{formatINR(s.min_balance)}</strong> ({sign}
        {formatINR(Math.abs(d.min_balance))}).
      </p>
      <p>{runsOutText}</p>
    </div>
  );
}
