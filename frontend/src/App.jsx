import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
      <div className="flex min-h-screen items-center justify-center p-4">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 shadow-sm">
            Could not load dashboard: {error}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-slate-500 font-medium">
            <span className="h-4 w-4 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
            Loading KhataFlow…
          </div>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="max-w-6xl mx-auto px-4 py-8 space-y-6"
    >
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Refresh failed: {error}
        </div>
      )}

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

      <AnimatePresence>
        {chaseClient && (
          <FollowUpDrawer
            client={chaseClient}
            onClose={() => setChaseClient(null)}
            onSent={reload}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {triageOpen && (
          <BadDayTriageModal
            open={triageOpen}
            onClose={() => setTriageOpen(false)}
            onOpenClient={openClientById}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
