"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Widget } from "@/components/layout/Widget";

interface MetaData {
  armies: {
    name: string;
    armyShareCode: string;
    armyLink: string;
    playerCount: number;
    useCount: number;
    percentage: number;
    averageStars: number;
    averageDestruction: number;
  }[];
  heroes: { id: number; name: string; count: number; percentage: number }[];
  equipment: {
    heroId: number;
    heroName: string;
    heroCount: number;
    combinations: { label: string; count: number; percentage: number }[];
  }[];
  battleStats: {
    date: string;
    totalAttacks: number;
    totalPlayers: number;
    stars: [number, number, number, number];
    armies: {
      name: string;
      armyShareCode: string;
      usageCount: number;
      stars: [number, number, number, number];
      totalDestruction: number;
    }[];
  } | null;
  fetchedAt: string | null;
  attribution: string;
}

function copyLink(code: string) {
  const url = `https://link.clashofclans.com/?action=CopyArmy&army=${encodeURIComponent(code)}`;
  navigator.clipboard
    .writeText(url)
    .then(() => toast.success("Army link copied"))
    .catch(() => toast.error("Copy failed"));
}

export function MetaPanel({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<MetaData | null>(null);

  useEffect(() => {
    fetch("/api/coc/meta")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, [refreshKey]);

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const bs = data.battleStats;
  const dayAvgStars = bs
    ? (bs.stars[1] + 2 * bs.stars[2] + 3 * bs.stars[3]) / Math.max(1, bs.totalAttacks)
    : null;
  const tripleRate = bs ? bs.stars[3] / Math.max(1, bs.totalAttacks) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Widget title="Top armies — Legend top 200">
          {data.armies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No meta snapshot yet — hit Sync or wait for the daily job.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border text-left">
                  <th className="px-2 py-1 font-medium">Army</th>
                  <th className="px-2 py-1 text-right font-medium">Players</th>
                  <th className="px-2 py-1 text-right font-medium">Avg ★</th>
                  <th className="px-2 py-1 text-right font-medium">Avg %</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {data.armies.slice(0, 12).map((a) => (
                  <tr
                    key={a.armyShareCode}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="px-2 py-1.5">{a.name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {a.playerCount}
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {a.percentage.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {a.averageStars.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {a.averageDestruction.toFixed(0)}%
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={() => copyLink(a.armyShareCode)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Copy army link"
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Widget>

        <div className="flex flex-col gap-4">
          <Widget title="Hero usage — top 200">
            <div className="flex flex-col gap-1.5">
              {data.heroes.slice(0, 6).map((h) => (
                <div key={h.id} className="flex items-center gap-2 text-sm">
                  <span className="w-32 truncate">{h.name}</span>
                  <div className="h-2 flex-1 rounded bg-muted">
                    <div
                      className="h-2 rounded bg-primary"
                      style={{ width: `${Math.min(100, h.percentage)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {h.percentage.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </Widget>

          <Widget title="Equipment combos — top 200">
            <div className="flex flex-col gap-2">
              {data.equipment.slice(0, 5).map((h) => (
                <div key={h.heroId}>
                  <p className="text-xs font-medium text-muted-foreground">
                    {h.heroName}
                  </p>
                  {h.combinations.slice(0, 2).map((c) => (
                    <p key={c.label} className="pl-2 text-sm tabular-nums">
                      {c.label}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {c.percentage.toFixed(0)}%
                      </span>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </Widget>
        </div>
      </div>

      {bs && (
        <Widget title={`Legend day ${bs.date} — all attacks`}>
          <p className="mb-2 text-xs text-muted-foreground tabular-nums">
            {bs.totalAttacks.toLocaleString()} attacks by{" "}
            {bs.totalPlayers.toLocaleString()} players · avg{" "}
            {dayAvgStars?.toFixed(2)}★ · triple rate{" "}
            {tripleRate != null ? `${(tripleRate * 100).toFixed(1)}%` : "—"}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border text-left">
                  <th className="px-2 py-1 font-medium">Army</th>
                  <th className="px-2 py-1 text-right font-medium">Uses</th>
                  <th className="px-2 py-1 text-right font-medium">Share</th>
                  <th className="px-2 py-1 text-right font-medium">3★ rate</th>
                  <th className="px-2 py-1 text-right font-medium">Avg %</th>
                  <th className="px-2 py-1" />
                </tr>
              </thead>
              <tbody>
                {bs.armies.slice(0, 15).map((a) => {
                  const triples = a.stars[3] / Math.max(1, a.usageCount);
                  const avgDest = a.totalDestruction / Math.max(1, a.usageCount);
                  return (
                    <tr
                      key={a.armyShareCode}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="px-2 py-1.5">{a.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {a.usageCount.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {((a.usageCount / bs.totalAttacks) * 100).toFixed(1)}%
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums ${
                          triples > 0.5 ? "text-green-400" : ""
                        }`}
                      >
                        {(triples * 100).toFixed(0)}%
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {avgDest.toFixed(0)}%
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => copyLink(a.armyShareCode)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Copy army link"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Widget>
      )}

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {data.attribution}
        <a
          href="https://warreport.app"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-primary"
        >
          <ExternalLink className="size-3" /> warreport.app
        </a>
        {data.fetchedAt && (
          <span className="ml-2">
            · snapshot {new Date(data.fetchedAt).toLocaleString()}
          </span>
        )}
      </p>
    </div>
  );
}
