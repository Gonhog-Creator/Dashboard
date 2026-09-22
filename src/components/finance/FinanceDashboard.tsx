"use client";

import { useState } from "react";
import {
  Wallet,
  LayoutDashboard,
  List,
  TrendingUp,
  Repeat,
  ChartColumn,
  Landmark,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OverviewPanel } from "./OverviewPanel";
import { SpendingPanel } from "./SpendingPanel";
import { TransactionsPanel } from "./TransactionsPanel";
import { InvestmentsPanel } from "./InvestmentsPanel";
import { RecurringPanel } from "./RecurringPanel";
import { AccountsPanel } from "./AccountsPanel";
import { ConnectionsPanel } from "./ConnectionsPanel";

const PORTAL_LINKS = [
  { label: "First Citizens", url: "https://www.firstcitizens.com" },
  { label: "Fidelity", url: "https://www.fidelity.com" },
  { label: "Coinbase", url: "https://www.coinbase.com" },
];

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "spending", label: "Spending", icon: ChartColumn },
  { id: "transactions", label: "Transactions", icon: List },
  { id: "investments", label: "Investments", icon: TrendingUp },
  { id: "recurring", label: "Recurring", icon: Repeat },
  { id: "accounts", label: "Accounts", icon: Landmark },
];

export function FinanceDashboard() {
  const [tab, setTab] = useState("overview");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/finance/sync", { method: "POST" });
      const data = await res.json();
      setSyncMsg(data.message ?? (res.ok ? "synced" : "sync failed"));
      setRefreshKey((k) => k + 1);
    } catch {
      setSyncMsg("sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="w-full">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Wallet className="size-6 text-primary" />
          <h1 className="text-xl font-semibold">Finance</h1>
          <div className="hidden sm:flex items-center gap-1.5">
            {PORTAL_LINKS.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <ExternalLink className="size-3" />
                {l.label}
              </a>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className="text-xs text-muted-foreground max-w-64 truncate">
              {syncMsg}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={syncNow}
            disabled={syncing}
          >
            <RefreshCw className={syncing ? "animate-spin" : ""} />
            Sync
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap h-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="gap-1.5">
              <Icon className="size-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <OverviewPanel refreshKey={refreshKey} onNavigate={setTab} />
        </TabsContent>
        <TabsContent value="spending">
          <SpendingPanel refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="transactions">
          <TransactionsPanel refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="investments">
          <InvestmentsPanel refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="recurring">
          <RecurringPanel refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="accounts">
          <div className="space-y-6">
            <AccountsPanel refreshKey={refreshKey} />
            <ConnectionsPanel onChanged={() => setRefreshKey((k) => k + 1)} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
