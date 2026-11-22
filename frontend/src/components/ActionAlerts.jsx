import { AlertTriangle, Info } from "lucide-react";

const LEVELS = {
  critical: { cls: "border-red-200 bg-red-50 text-red-800", icon: AlertTriangle },
  warning: { cls: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle },
  info: { cls: "border-blue-200 bg-blue-50 text-blue-800", icon: Info },
};

export default function ActionAlerts({ alerts, onOpenClient }) {
  const list = alerts || [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Action alerts
      </h2>
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">No alerts right now.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((alert, i) => {
            const lvl = LEVELS[alert.level] || LEVELS.info;
            const Icon = lvl.icon;
            const body = (
              <>
                <Icon size={16} className="mt-0.5 shrink-0" />
                <span className="text-sm">{alert.text}</span>
              </>
            );
            return (
              <li key={`${alert.level}-${i}`}>
                {alert.client_id != null ? (
                  <button
                    type="button"
                    onClick={() => onOpenClient?.(alert.client_id)}
                    className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left hover:brightness-95 ${lvl.cls}`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${lvl.cls}`}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
