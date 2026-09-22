"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Widget } from "@/components/layout/Widget";

interface ApiStatus {
  configured: {
    apiKey: boolean;
    clanTag: string | null;
    playerTag: string | null;
    baseUrl: string;
  };
  lastSync: Record<string, string | null>;
  endpoints: { path: string; used: boolean; for: string }[];
}

const SYNC_LABELS: Record<string, string> = {
  clanPoll: "Clan poll (15 min)",
  war: "War capture",
  raids: "Raid seasons",
  battleLogs: "Battle logs",
  memberSnapshots: "Member snapshots",
  cwlGroup: "CWL group",
};

function ago(iso: string | null) {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ConfigPanel({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<ApiStatus | null>(null);

  useEffect(() => {
    fetch("/api/coc/config")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [refreshKey]);

  if (!data)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { configured, lastSync, endpoints } = data;
  const active = endpoints.filter((e) => e.used).length;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Widget title="Connection">
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">API key</span>
            {configured.apiKey ? (
              <span className="inline-flex items-center gap-1 text-green-400">
                <Check className="size-3.5" /> set
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-400">
                <X className="size-3.5" /> missing
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Clan tag</span>
            <span className="tabular-nums">{configured.clanTag ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Player tag</span>
            <span className="tabular-nums">{configured.playerTag ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">API base</span>
            <span className="text-xs text-muted-foreground">
              {configured.baseUrl}
            </span>
          </div>
        </div>
      </Widget>

      <Widget title="Pipeline freshness">
        <div className="flex flex-col gap-1.5 text-sm">
          {Object.entries(SYNC_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="tabular-nums">{ago(lastSync[key] ?? null)}</span>
            </div>
          ))}
        </div>
      </Widget>

      <Widget
        title={`API coverage — ${active}/${endpoints.length} endpoints active`}
        className="md:col-span-2"
      >
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border text-left">
              <th className="px-2 py-1.5 font-medium">Endpoint</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 font-medium">Used for</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((e) => (
              <tr key={e.path} className="border-b border-border/40 last:border-0">
                <td className="px-2 py-1.5 font-mono text-xs">{e.path}</td>
                <td className="px-2 py-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      e.used
                        ? "bg-green-500/15 text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {e.used ? "active" : "not active"}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">{e.for}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Widget>
    </div>
  );
}
