"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Hammer, Zap, Wrench } from "lucide-react";
import { Widget } from "@/components/layout/Widget";

interface VillageItem {
  dataId: number;
  name: string;
  count: number;
  levels: number[];
  maxLevel: number | null;
  maxCount: number | null;
  icon: string | null;
  supercharged: number;
  gearedUp: number;
  upgrading: { toLevel: number; finishAt: string }[];
}

interface VillageCategory {
  key: string;
  label: string;
  current: number;
  max: number;
  pct: number | null;
  items: VillageItem[];
}

interface Village {
  tag: string | null;
  exportedAt: string | null;
  townHall: number;
  categories: VillageCategory[];
  upgrades: { name: string; icon: string | null; toLevel: number; finishAt: string }[];
  obstacles: VillageItem[];
  decos: VillageItem[];
  helpers: { name: string; lvl: number; cooldownSec: number | null; icon: string | null }[];
  guardians: { name: string; lvl: number; icon: string | null }[];
  unmapped: number[];
}

function ItemIcon({
  src,
  name,
  className = "size-12",
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span
        className={`flex ${className} items-center justify-center rounded bg-muted text-xs font-bold text-muted-foreground`}
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className={`${className} object-contain`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function timeLeft(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "done";
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ItemChip({ item }: { item: VillageItem }) {
  const maxed =
    item.maxLevel != null && item.levels.every((l) => l >= item.maxLevel!);
  // Obstacles/decorations have no levels — show amount owned instead of "0".
  const hasLevels =
    item.maxLevel != null || item.levels.some((l) => l > 0);
  const lvlText = !hasLevels
    ? `×${item.count}`
    : item.count > 1
      ? `${Math.min(...item.levels)}–${Math.max(...item.levels)}`
      : `${item.levels[0] ?? "?"}`;
  return (
    <div
      className={`flex w-20 flex-col items-center gap-1 rounded-md border p-2 ${
        maxed ? "border-green-500/40" : "border-border"
      }`}
      title={`${item.name} ×${item.count} — levels ${item.levels.join(", ")}${
        item.maxLevel ? ` (max ${item.maxLevel})` : ""
      }${item.upgrading.length ? " — upgrading" : ""}`}
    >
      <div className="relative">
        <ItemIcon src={item.icon} name={item.name} />
        {item.upgrading.length > 0 && (
          <Hammer className="absolute -right-1 -top-1 size-3.5 text-amber-400" />
        )}
        {item.supercharged > 0 && (
          <Zap className="absolute -left-1 -top-1 size-3.5 text-cyan-400" />
        )}
      </div>
      <span className="w-full truncate text-center text-[11px] leading-tight text-muted-foreground">
        {item.name}
      </span>
      <span
        className={`text-xs tabular-nums leading-tight ${
          maxed ? "text-green-400" : ""
        }`}
      >
        {lvlText}
        {item.maxLevel ? `/${item.maxLevel}` : ""}
        {item.count > 1 && <span className="text-muted-foreground"> ×{item.count}</span>}
      </span>
    </div>
  );
}

interface VillageData {
  configured: boolean;
  village?: Village;
  error?: string;
}

function useVillage(refreshKey: number): VillageData | null {
  const [data, setData] = useState<VillageData | null>(null);
  useEffect(() => {
    fetch("/api/coc/village")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ configured: false }));
  }, [refreshKey]);
  return data;
}

function NotConfigured({ error }: { error?: string }) {
  return (
    <Widget title="Village tracker" className="lg:col-span-2">
      <p className="text-sm text-muted-foreground">
        {error ??
          "Paste your village export in Settings → Clash of Clans to unlock the upgrade tracker."}{" "}
        In-game: Settings → More Settings → Data Export → Copy.{" "}
        <Link href="/settings" className="text-primary underline">
          Open Settings
        </Link>
      </p>
    </Widget>
  );
}

/** "Upgrading now" + "Overall completion" — stacked; sits right of the profile card. */
export function VillageSummary({ refreshKey }: { refreshKey: number }) {
  const data = useVillage(refreshKey);
  if (!data) return null;
  if (!data.configured || data.error || !data.village)
    return <NotConfigured error={data.error} />;

  const v = data.village;
  const overall = v.categories.filter((c) => c.pct != null);
  const overallPct = overall.length
    ? Math.round(
        (overall.reduce((s, c) => s + c.current, 0) /
          overall.reduce((s, c) => s + c.max, 0)) *
          100
      )
    : null;

  return (
    <div className="flex flex-col gap-4 xl:col-span-2">
      {/* Active upgrades */}
      <Widget title={`Upgrading now — TH${v.townHall}`}>
        {v.upgrades.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing upgrading — all builders idle.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {v.upgrades.map((u, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2"
              >
                <ItemIcon src={u.icon} name={u.name} />
                <div>
                  <p className="text-sm font-medium leading-tight">
                    {u.name} → {u.toLevel}
                  </p>
                  <p className="text-xs tabular-nums text-amber-400">
                    {timeLeft(u.finishAt)} left
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span>
            Export from{" "}
            {v.exportedAt ? new Date(v.exportedAt).toLocaleString() : "?"} ·{" "}
            {v.obstacles.reduce((s, o) => s + o.count, 0)} obstacles ·{" "}
            {v.decos.reduce((s, d) => s + d.count, 0)} decorations
          </span>
          {v.helpers.map((h) => (
            <span key={h.name} className="inline-flex items-center gap-1.5">
              <ItemIcon src={h.icon} name={h.name} className="size-5" />
              {h.name} {h.lvl}
            </span>
          ))}
          {v.guardians.map((g) => (
            <span key={g.name} className="inline-flex items-center gap-1.5">
              <ItemIcon src={g.icon} name={g.name} className="size-5" />
              {g.name} {g.lvl}
            </span>
          ))}
        </div>
      </Widget>

      {/* Overall progress */}
      {overallPct != null && (
        <Widget title="Overall completion">
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 rounded bg-muted">
              <div
                className="h-3 rounded bg-primary transition-all"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <span className="text-xl font-bold tabular-nums">{overallPct}%</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {v.categories.map((c) => (
              <span key={c.key} className="tabular-nums">
                {c.label} {c.pct != null ? `${c.pct}%` : "—"}
              </span>
            ))}
          </div>
        </Widget>
      )}
    </div>
  );
}

/** Category grids + obstacles — flows below the profile/summary row. */
export function VillageCategories({ refreshKey }: { refreshKey: number }) {
  const data = useVillage(refreshKey);
  if (!data?.configured || data.error || !data.village) return null;
  const v = data.village;

  return (
    <>
      {/* Category grids */}
      {v.categories.map((c) => (
        <Widget
          key={c.key}
          title={`${c.label}${c.pct != null ? ` — ${c.pct}%` : ""}`}
        >
          {c.pct != null && (
            <div className="mb-2 h-1.5 rounded bg-muted">
              <div
                className="h-1.5 rounded bg-primary"
                style={{ width: `${c.pct}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {c.items.map((it) => (
              <ItemChip key={it.dataId} item={it} />
            ))}
          </div>
        </Widget>
      ))}

      {v.obstacles.length > 0 && (
        <Widget title="Obstacles" className="lg:col-span-2 xl:col-span-3">
          <div className="flex flex-wrap gap-1.5">
            {v.obstacles.map((it) => (
              <ItemChip key={it.dataId} item={it} />
            ))}
          </div>
        </Widget>
      )}

      {v.decos.length > 0 && (
        <Widget title="Decorations" className="lg:col-span-2 xl:col-span-3">
          <div className="flex flex-wrap gap-1.5">
            {v.decos.map((it) => (
              <ItemChip key={it.dataId} item={it} />
            ))}
          </div>
        </Widget>
      )}

      {v.unmapped.length > 0 && (
        <p className="text-xs text-muted-foreground xl:col-span-3">
          <Wrench className="mr-1 inline size-3" />
          Unmapped ids (new content?): {v.unmapped.join(", ")}
        </p>
      )}
    </>
  );
}
