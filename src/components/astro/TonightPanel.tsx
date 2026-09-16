"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Widget } from "@/components/layout/Widget";
import { MoonIcon } from "./MoonIcon";
import { CloudMap } from "./CloudMap";
import {
  Clock3,
  CloudRain,
  Cloud,
  CloudMoon,
  Stars,
  CloudSun,
} from "lucide-react";
import type { HourlyCondition, TonightConditions } from "@/types";
import { cn } from "@/lib/utils";

const VERDICT_STYLES: Record<string, string> = {
  GO: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  MARGINAL: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "NO-GO": "bg-red-500/15 text-red-400 border-red-500/30",
  UNKNOWN: "bg-muted text-muted-foreground border-border",
};

/** Whole-tile tint driven by the verdict. */
const TILE_STYLES: Record<string, string> = {
  GO: "border-emerald-500/50 bg-emerald-500/[0.06]",
  MARGINAL: "border-amber-500/50 bg-amber-500/[0.06]",
  "NO-GO": "border-red-500/50 bg-red-500/[0.06]",
  UNKNOWN: "",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtHour(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric" });
}

/** Pick an icon for an hour: rain > heavy cloud > partial > clear stars. */
function HourIcon({ h }: { h: HourlyCondition }) {
  const cloud = h.cloudCover ?? 0;
  const cls = "size-4";
  if ((h.precipProb ?? 0) >= 40)
    return <CloudRain className={cn(cls, "text-blue-400")} />;
  if (cloud >= 70) return <Cloud className={cn(cls, "text-muted-foreground")} />;
  if (cloud >= 35)
    return <CloudMoon className={cn(cls, "text-muted-foreground")} />;
  if (cloud >= 15) return <CloudSun className={cn(cls, "text-amber-200/80")} />;
  return <Stars className={cn(cls, "text-amber-200")} />;
}

export function TonightPanel({
  title = "Tonight",
  className,
}: {
  title?: string;
  className?: string;
}) {
  const [data, setData] = useState<TonightConditions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    fetch("/api/astro/weather")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setStale(Boolean(d.stale));
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, []);

  const level = data?.verdict.level ?? "UNKNOWN";

  return (
    <Widget
      title={title}
      className={cn(className, TILE_STYLES[level])}
      action={
        data && (
          <Badge
            variant="outline"
            className={cn(
              "text-sm px-2.5 py-0.5 font-semibold",
              VERDICT_STYLES[level]
            )}
          >
            {level} · {data.verdict.score}
          </Badge>
        )
      }
    >
      {error ? (
        <p className="text-sm text-destructive">Weather: {error}</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <PanelBody data={data} stale={stale} />
      )}
    </Widget>
  );
}

function PanelBody({
  data,
  stale,
}: {
  data: TonightConditions;
  stale: boolean;
}) {
  const v = data.verdict;
  const now = Date.now();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <MoonIcon phase={data.moon.phase} angle={data.moon.angle} size={34} />
        <div className="flex flex-col">
          <span className="text-sm font-medium">
            {data.moon.name}{" "}
            <span className="text-muted-foreground">
              {Math.round(data.moon.phase * 100)}%
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3" />
            {fmtTime(data.dusk)}–{fmtTime(data.dawn)} ·{" "}
            {data.darkHours.toFixed(1)}h dark
          </span>
        </div>
        {stale && (
          <Badge
            variant="outline"
            className="ml-auto text-amber-400 border-amber-500/30"
          >
            stale
          </Badge>
        )}
      </div>

      {data.hourly.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-1">
          {data.hourly.map((h) => {
            const isNow =
              new Date(h.time).getTime() <= now &&
              now < new Date(h.time).getTime() + 3600_000;
            return (
              <div
                key={h.time}
                className={cn(
                  "flex min-w-11 flex-col items-center gap-0.5 rounded-md px-1.5 py-1.5",
                  isNow ? "bg-accent" : "bg-muted/40"
                )}
              >
                <span className="text-[10px] text-muted-foreground">
                  {fmtHour(h.time)}
                </span>
                <HourIcon h={h} />
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {h.cloudCover !== null ? `${Math.round(h.cloudCover)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <CloudMap lat={data.observer.lat} lon={data.observer.lon} />

      <ul className="text-xs text-muted-foreground flex flex-col gap-0.5">
        {v.reasons.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
    </div>
  );
}
