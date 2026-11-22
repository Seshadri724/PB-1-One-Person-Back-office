import { MessageSquareText } from "lucide-react";
import { motion } from "framer-motion";
import { formatINR } from "../utils/format";

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700 border-indigo-200",
  "bg-violet-100 text-violet-700 border-violet-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "bg-rose-100 text-rose-700 border-rose-200",
  "bg-amber-100 text-amber-700 border-amber-200",
];

function getInitials(name) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function WhoOwesMe({ clients, onChase }) {
  const rows = clients || [];

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Who do I chase RIGHT NOW?
          </h2>
          <p className="text-xs text-slate-500">
            Ranked by overdue urgency and outstanding balance
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {rows.length} Active Client{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Nobody owes you money right now. Your receivables are clear!
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <th className="pb-3 pr-4">Client</th>
                <th className="pb-3 pr-4 text-right">Outstanding</th>
                <th className="pb-3 pr-4 text-right">Aging / Status</th>
                <th className="pb-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, idx) => {
                const colorCls = getAvatarColor(row.client_name);
                const initials = getInitials(row.client_name);

                return (
                  <motion.tr
                    key={row.client_id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: idx * 0.03 }}
                    className="group hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Client Name + Avatar */}
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${colorCls}`}>
                          {initials}
                        </span>
                        <div>
                          <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {row.client_name}
                          </div>
                          {row.company && row.company !== row.client_name && (
                            <div className="text-xs text-slate-500">{row.company}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Outstanding Amount */}
                    <td className="py-3.5 pr-4 text-right font-mono text-sm font-semibold tabular-nums text-slate-900">
                      {formatINR(row.outstanding)}
                    </td>

                    {/* Overdue Status Tag */}
                    <td className="py-3.5 pr-4 text-right">
                      {row.days_overdue > 30 ? (
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                          {row.days_overdue} days late
                        </span>
                      ) : row.days_overdue > 0 ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          {row.days_overdue} days late
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          Not yet due
                        </span>
                      )}
                    </td>

                    {/* Chase CTA */}
                    <td className="py-3.5 text-right">
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        type="button"
                        onClick={() => onChase?.(row)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow"
                      >
                        <MessageSquareText size={14} /> Chase
                      </motion.button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
