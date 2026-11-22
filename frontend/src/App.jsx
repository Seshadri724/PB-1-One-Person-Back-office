import { useCallback, useEffect, useState } from "react";
import { getDashboard } from "./api";
import ActionAlerts from "./components/ActionAlerts.jsx";
import BadDayTriageModal from "./components/BadDayTriageModal.jsx";
import BillsManager from "./components/BillsManager.jsx";
import CashForecastChart from "./components/CashForecastChart.jsx";
import FollowUpDrawer from "./components/FollowUpDrawer.jsx";
import QuickInvoiceModal from "./components/QuickInvoiceModal.jsx";
import TopBar from "./components/TopBar.jsx";
import WhatIfPanel from "./components/WhatIfPanel.jsx";
import WhoOwesMe from "./components/WhoOwesMe.jsx";

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [triageOpen, setTriageOpen] = useState(false);
  const [chaseClient, setChaseClient] = useState(null);

  const reload = useCallback(async () => {
    try {
      setData(await getDashboard());
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const openClientById = (id) => {
    const client = data?.who_owes.find((c) => c.client_id === id);
    if (client) setChaseClient(client);
  };

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        {error ? (
          <p className="text-red-600">Could not load dashboard: {error}</p>
        ) : (
          <p className="text-slate-500">Loading KhataFlow…</p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {error && <p className="text-red-600 text-sm">Refresh failed: {error}</p>}
      <TopBar
        settings={data.settings}
        onReload={reload}
        onNewInvoice={() => setInvoiceOpen(true)}
        onTriage={() => setTriageOpen(true)}
      />
      <ActionAlerts alerts={data.alerts} onOpenClient={openClientById} />
      <WhoOwesMe clients={data.who_owes} onChase={setChaseClient} />
      <CashForecastChart forecast={data.forecast} totals={data.totals} settings={data.settings} />
      <WhatIfPanel />
      <BillsManager onChanged={reload} />

      <QuickInvoiceModal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        onCreated={() => {
          setInvoiceOpen(false);
          reload();
        }}
      />
      <FollowUpDrawer
        client={chaseClient}
        onClose={() => setChaseClient(null)}
        onSent={reload}
      />
      <BadDayTriageModal
        open={triageOpen}
        onClose={() => setTriageOpen(false)}
        onOpenClient={openClientById}
      />
    </div>
  );
}
