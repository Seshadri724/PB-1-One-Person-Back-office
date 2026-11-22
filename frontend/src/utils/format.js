const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Date-only ISO strings are parsed as local dates to avoid off-by-one day shifts.
function toDate(v) {
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
}

// Indian digit grouping: 145000 -> "1,45,000"
export function formatINR(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? "-" : "";
  const digits = String(Math.abs(v));
  let head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  if (head) head = head.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${sign}₹${head ? head + "," : ""}${tail}`;
}

// Chart axis labels: 120000 -> "₹1.2L", 45000 -> "₹45k", 500 -> "₹500"
export function shortINR(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 100000) return `${sign}₹${+(a / 100000).toFixed(1)}L`;
  if (a >= 1000) return `${sign}₹${+(a / 1000).toFixed(1)}k`;
  return `${sign}₹${a}`;
}

// "12 Mar"
export function formatDate(d) {
  const dt = toDate(d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}

// Whole calendar days from `from` to `to` (negative if `to` is earlier).
export function daysBetween(from, to) {
  const utc = (v) => {
    const x = toDate(v);
    return Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  };
  return Math.round((utc(to) - utc(from)) / 864e5);
}
