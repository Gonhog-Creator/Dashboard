"use client";

import { useState } from "react";
import {
  Swords,
  LayoutDashboard,
  Users,
  Shield,
  Castle,
  User,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  Settings2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OverviewPanel } from "./OverviewPanel";
import { MembersPanel } from "./MembersPanel";
import { WarsPanel } from "./WarsPanel";
import { CapitalPanel } from "./CapitalPanel";
import { MePanel } from "./MePanel";
import { MetaPanel } from "./MetaPanel";
import { ConfigPanel } from "./ConfigPanel";

const LINKS = [
  { label: "ClashSpot", url: "https://clashspot.net" },
  { label: "War Report", url: "https://warreport.app" },
  { label: "Clash of Stats", url: "https://www.clashofstats.com" },
];

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "members", label: "Members", icon: Users },
  { id: "wars", label: "Wars", icon: Shield },
  { id: "capital", label: "Capital", icon: Castle },
  { id: "me", label: "Me", icon: User },
  { id: "meta", label: "Meta", icon: TrendingUp },
  { id: "config", label: "Config", icon: Settings2 },
];

export function CocDashboard() {
  const [tab, setTab] = useState("overview");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function syncNow() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/coc/sync?what=all", { method: "POST" });
      const data = await res.json();
      setSyncMsg(data.message ?? data.error ?? (res.ok ? "synced" : "sync failed"));
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
          <Swords className="size-6 text-primary" />
          <h1 className="text-xl font-semibold">Clash of Clans</h1>
          <div className="hidden sm:flex items-center gap-1.5">
            {LINKS.map((l) => (
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
          <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing}>
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
          <OverviewPanel refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="members">
          <MembersPanel refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="wars">
          <WarsPanel refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="capital">
          <CapitalPanel refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="me">
          <MePanel refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="meta">
          <MetaPanel refreshKey={refreshKey} />
        </TabsContent>
        <TabsContent value="config">
          <ConfigPanel refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
