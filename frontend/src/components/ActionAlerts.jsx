import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import { motion } from "framer-motion";

const LEVELS = {
  critical: {
    container: "border-rose-200/80 bg-rose-50/70 text-rose-900",
    iconColor: "text-rose-600",
    badge: "bg-rose-100 text-rose-700",
    icon: AlertTriangle,
  },
  warning: {
    container: "border-amber-200/80 bg-amber-50/70 text-amber-900",
    iconColor: "text-amber-600",
    badge: "bg-amber-100 text-amber-800",
    icon: AlertTriangle,
  },
  info: {
    container: "border-blue-200/80 bg-blue-50/70 text-blue-900",
    iconColor: "text-blue-600",
    badge: "bg-blue-100 text-blue-700",
    icon: Info,
  },
};

export default function ActionAlerts({ alerts, onOpenClient }) {
  const list = alerts || [];

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Action Alerts · Urgent Priorities
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
          {list.length} item{list.length === 1 ? "" : "s"}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">No active alerts. All cash flows are healthy.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((alert, i) => {
            const lvl = LEVELS[alert.level] || LEVELS.info;
            const Icon = lvl.icon;
            const isClickable = alert.client_id != null;

            return (
              <motion.li
                key={`${alert.level}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.04 }}
              >
                {isClickable ? (
                  <button
                    type="button"
                    onClick={() => onOpenClient?.(alert.client_id)}
                    className={`group flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all hover:shadow-card hover:brightness-[0.98] ${lvl.container}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon size={17} className={`mt-0.5 shrink-0 ${lvl.iconColor}`} />
                      <span className="text-sm font-medium leading-relaxed">{alert.text}</span>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition-transform group-hover:translate-x-0.5">
                      Chase <ChevronRight size={14} className="text-slate-400" />
                    </span>
                  </button>
                ) : (
                  <div className={`flex items-start gap-2.5 rounded-xl border p-3 ${lvl.container}`}>
                    <Icon size={17} className={`mt-0.5 shrink-0 ${lvl.iconColor}`} />
                    <span className="text-sm font-medium leading-relaxed">{alert.text}</span>
                  </div>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
