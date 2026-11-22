import { MessageSquareText } from "lucide-react";
import { formatINR } from "../utils/format";

// `clients` is dashboard.who_owes: rows of
// { client_id, client_name, company, outstanding, days_overdue, invoice_count }
export default function WhoOwesMe({ clients, onChase }) {
  const rows = clients || [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-slate-900">
        Who do I chase RIGHT NOW?
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nobody owes you money. Nice.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Client</th>
                <th className="py-2 pr-3 text-right font-medium">Outstanding</th>
                <th className="py-2 pr-3 text-right font-medium">Days overdue</th>
                <th className="py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.client_id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-slate-900">{row.client_name}</div>
                    {row.company && row.company !== row.client_name && (
                      <div className="text-xs text-slate-500">{row.company}</div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-slate-900">
                    {formatINR(row.outstanding)}
                  </td>
                  <td
                    className={`py-2.5 pr-3 text-right tabular-nums ${
                      row.days_overdue > 30
                        ? "font-semibold text-red-600"
                        : row.days_overdue > 0
                          ? "text-amber-600"
                          : "text-slate-500"
                    }`}
                  >
                    {row.days_overdue > 0 ? `${row.days_overdue} days` : "Not yet due"}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onChase?.(row)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                    >
                      <MessageSquareText size={14} /> Chase
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
