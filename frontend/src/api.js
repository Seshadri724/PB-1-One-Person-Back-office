// Thin wrapper around the FastAPI backend. Paths are relative; Vite proxies /api.

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) {
        message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // non-JSON error body: keep the generic message
    }
    throw new Error(message);
  }
  return res.json();
}

const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });

export const getDashboard = () => request("/api/dashboard");

export const getClients = () => request("/api/clients");
export const createClient = (payload) => post("/api/clients", payload);

export const getInvoices = () => request("/api/invoices");
// payload is either an invoice object or { text } for natural-language entry.
export const createInvoice = (payload) => post("/api/invoices", payload);
export const recordPayment = (invoiceId, amount) =>
  post(`/api/invoices/${invoiceId}/payments`, { amount });

export const getForecast = (days = 90) => request(`/api/forecast?days=${days}`);
export const whatIf = (payload, days = 90) =>
  post(`/api/forecast/whatif?days=${days}`, payload);

export const getBills = () => request("/api/bills");
export const createBill = (payload) => post("/api/bills", payload);
export const updateBill = (id, paid) =>
  request(`/api/bills/${id}`, { method: "PATCH", body: JSON.stringify({ paid }) });

export const getReminder = (clientId, tone) =>
  post(`/api/clients/${clientId}/reminders`, { tone });
export const postReminder = getReminder;

export const getFollowups = (clientId) => request(`/api/clients/${clientId}/followups`);
export const addFollowup = (clientId, body) =>
  post(`/api/clients/${clientId}/followups`, body);

export const getAlerts = () => request("/api/alerts");

export const getSettings = () => request("/api/settings");
export const updateSettings = (payload) =>
  request("/api/settings", { method: "PUT", body: JSON.stringify(payload) });

export const resetDemo = () => post("/api/reset", {});


export const getRunway = () => request("/api/runway");

export const parseBankSms = (text) => post("/api/reconcile/parse", { text });

// Unlike request(), a non-2xx here throws the JSON `detail` or the HTTP status text,
// so the UI can surface e.g. "Duplicate UPI reference".
export const confirmReconciliation = async ({ invoice_id, amount, reference, sender, text }) => {
  const res = await fetch("/api/reconcile/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_id, amount, reference, sender, text }),
  });
  if (!res.ok) {
    let message = res.statusText || `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) {
        message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // non-JSON error body: keep the status text
    }
    throw new Error(message);
  }
  return res.json();
};

export const discountLever = ({ client_id, invoice_id, discount_percent, hours }) =>
  post("/api/levers/discount", { client_id, invoice_id, discount_percent, hours });

export const deferBillLever = (bill_id, days) => post("/api/levers/defer-bill", { bill_id, days });

export const getStaggeredChase = () => request("/api/levers/staggered-chase");

