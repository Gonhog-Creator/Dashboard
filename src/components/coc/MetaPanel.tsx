"use client";

import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Widget } from "@/components/layout/Widget";

interface MetaIcon {
  name: string;
  count: number;
  icon: string | null;
}

interface ArmyComposition {
  troops: MetaIcon[];
  cc: MetaIcon[];
  spells: MetaIcon[];
  ccSpells: MetaIcon[];
  heroes: {
    name: string;
    icon: string | null;
    pet: { name: string; icon: string | null } | null;
    equipment: { name: string; icon: string | null }[];
  }[];
}

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
    composition: ArmyComposition;
  }[];
  heroes: {
    id: number;
    name: string;
    count: number;
    percentage: number;
    icon: string | null;
  }[];
  equipment: {
    heroId: number;
    heroName: string;
    heroIcon: string | null;
    heroCount: number;
    equipment: {
      id: number;
      name: string;
      count: number;
      percentage: number;
      icon: string | null;
    }[];
    combinations: {
      ids: number[];
      label: string;
      count: number;
      percentage: number;
    }[];
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
      composition: ArmyComposition;
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

/** Game icon that hides itself if the CDN 404s (new content lag). */
function GameIcon({
  src,
  name,
  size = 22,
  className,
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  if (!src)
    return (
      <span
        className="inline-flex items-center justify-center rounded bg-muted text-[8px] font-semibold text-muted-foreground"
        style={{ width: size, height: size }}
        title={name}
      >
        {name.slice(0, 2)}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      title={name}
      width={size}
      height={size}
      className={className}
      onError={(e) => {
        (e.target as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  );
}

/** Row of troop/spell icons with ×count badges — war-report style. */
function IconStrip({ items, size = 22 }: { items: MetaIcon[]; size?: number }) {
  return (
    <>
      {items.map((it, i) => (
        <span
          key={`${it.name}-${i}`}
          className="relative inline-flex shrink-0"
          title={`${it.count}× ${it.name}`}
        >
          <GameIcon src={it.icon} name={it.name} size={size} />
          {it.count > 1 && (
            <span className="absolute -bottom-1 -right-1 rounded-sm bg-background/95 px-0.5 text-[8px] font-bold leading-3 text-foreground shadow">
              {it.count}
            </span>
          )}
        </span>
      ))}
    </>
  );
}

/** Full decoded army: heroes (with pet + equipment), troops, CC, spells. */
function ArmyComp({ c }: { c: ArmyComposition }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {c.heroes.map((h, i) => (
        <span key={`h${i}`} className="inline-flex items-end gap-0.5">
          <span className="relative inline-flex" title={h.name}>
            <GameIcon src={h.icon} name={h.name} size={24} />
            {h.pet && (
              <span
                className="absolute -bottom-1 -right-1"
                title={h.pet.name}
              >
                <GameIcon
                  src={h.pet.icon}
                  name={h.pet.name}
                  size={11}
                  className="rounded-full ring-1 ring-background"
                />
              </span>
            )}
          </span>
          {h.equipment.map((e, j) => (
            <GameIcon key={j} src={e.icon} name={e.name} size={13} />
          ))}
        </span>
      ))}
      {c.heroes.length > 0 && (
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      )}
      <IconStrip items={c.troops} />
      {c.cc.length > 0 && (
        <>
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
          <IconStrip items={c.cc} />
        </>
      )}
      {(c.spells.length > 0 || c.ccSpells.length > 0) && (
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      )}
      <IconStrip items={c.spells} />
      <IconStrip items={c.ccSpells} />
    </div>
  );
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
                  <GameIcon src={h.icon} name={h.name} size={22} />
                  <span className="w-28 truncate">{h.name}</span>
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
            <div className="flex flex-col gap-3">
              {data.equipment.slice(0, 5).map((h) => (
                <div key={h.heroId}>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <GameIcon
                      src={h.heroIcon}
                      name={h.heroName}
                      size={18}
                    />
                    {h.heroName}
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {h.combinations.slice(0, 4).map((c) => (
                      <div
                        key={c.label}
                        className="flex items-center gap-1.5"
                        title={c.label}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {c.ids.map((id) => {
                            const eq = h.equipment.find((e) => e.id === id);
                            return (
                              <GameIcon
                                key={id}
                                src={eq?.icon ?? null}
                                name={eq?.name ?? String(id)}
                                size={20}
                              />
                            );
                          })}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {c.percentage.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
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
                      <td className="px-2 py-1.5">
                        <p className="font-medium">{a.name}</p>
                        <ArmyComp c={a.composition} />
                      </td>
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
