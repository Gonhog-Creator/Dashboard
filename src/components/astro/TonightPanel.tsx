"use client";

import { useEffect, useState } from "react";
import { Widget } from "@/components/layout/Widget";
import { MoonIcon } from "./MoonIcon";
import { CloudMap } from "./CloudMap";
import { CloudRain, Cloud, CloudMoon, Stars } from "lucide-react";
import type { HourlyCondition, TonightConditions, VerdictLevel } from "@/types";
import { cn } from "@/lib/utils";

const LEVEL_TEXT: Record<VerdictLevel, string> = {
  GO: "text-emerald-400",
  MARGINAL: "text-amber-400",
  "NO-GO": "text-red-400",
  UNKNOWN: "text-muted-foreground",
};

/** Whole-tile tint driven by the verdict. */
const TILE_STYLES: Record<VerdictLevel, string> = {
  GO: "ring-emerald-500/40 bg-emerald-500/[0.05]",
  MARGINAL: "ring-amber-500/40 bg-amber-500/[0.05]",
  "NO-GO": "ring-red-500/40 bg-red-500/[0.05]",
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
    return <CloudRain className={cn(cls, "text-sky-400")} />;
  if (cloud >= 60) return <Cloud className={cn(cls, "text-foreground/60")} />;
  if (cloud >= 25)
    return <CloudMoon className={cn(cls, "text-foreground/70")} />;
  return <Stars className={cn(cls, "text-sky-200")} />;
}

export function TonightPanel({
  title = "Tonight",
  className,
  contentClassName,
  showMap = true,
  initialData,
}: {
  title?: string;
  className?: string;
  contentClassName?: string;
  showMap?: boolean;
  /** Server-rendered snapshot — skips the client fetch when provided. */
  initialData?: TonightConditions | null;
}) {
  const [data, setData] = useState<TonightConditions | null>(
    initialData ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (initialData) return; // server already fetched
    fetch("/api/astro/weather")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setStale(Boolean(d.stale));
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [initialData]);

  const level: VerdictLevel = data?.verdict.level ?? "UNKNOWN";

  return (
    <Widget
      title={title}
      className={cn(className, TILE_STYLES[level])}
      contentClassName={cn("flex flex-col", contentClassName)}
      action={
        data && (
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              LEVEL_TEXT[level]
            )}
          >
            {level} · {data.verdict.score}
          </span>
        )
      }
    >
      {error ? (
        <p className="text-sm text-destructive">Weather: {error}</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <PanelBody data={data} stale={stale} showMap={showMap} />
      )}
    </Widget>
  );
}

const COL_W = 44; // px per hour column — keep in sync with w-11 below
const CHART_H = 34;

/** Catmull-Rom → cubic bezier for a smooth cloud-cover curve. */
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return "";
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d +=
      ` C ${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)}` +
      ` ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)}` +
      ` ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** Apple Weather-style hourly strip: curve on top, flat columns below. */
function HourlyStrip({
  hourly,
  now,
}: {
  hourly: HourlyCondition[];
  now: number;
}) {
  const w = hourly.length * COL_W;
  const pts = hourly.map((h, i) => ({
    x: i * COL_W + COL_W / 2,
    y: CHART_H - 4 - ((h.cloudCover ?? 0) / 100) * (CHART_H - 10),
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1].x} ${CHART_H} L ${pts[0].x} ${CHART_H} Z`;
  const nowIdx = hourly.findIndex(
    (h) =>
      new Date(h.time).getTime() <= now &&
      now < new Date(h.time).getTime() + 3600_000
  );

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div style={{ width: w }} className="min-w-full">
        <svg
          width={w}
          height={CHART_H}
          className="block text-sky-300/70"
          aria-hidden
        >
          <defs>
            <linearGradient id="cloudFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#cloudFill)" />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {nowIdx >= 0 && (
            <circle
              cx={pts[nowIdx].x}
              cy={pts[nowIdx].y}
              r="2.5"
              className="fill-foreground"
            />
          )}
        </svg>
        <div className="mt-1 flex">
          {hourly.map((h, i) => (
            <div
              key={h.time}
              className="flex w-11 shrink-0 flex-col items-center gap-1"
            >
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  i === nowIdx
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {i === nowIdx ? "Now" : fmtHour(h.time)}
              </span>
              <HourIcon h={h} />
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {h.cloudCover !== null ? `${Math.round(h.cloudCover)}%` : "—"}
              </span>
              <span className="h-3.5 text-[11px] tabular-nums text-sky-400">
                {(h.precipProb ?? 0) >= 20
                  ? `${Math.round(h.precipProb!)}%`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelBody({
  data,
  stale,
  showMap,
}: {
  data: TonightConditions;
  stale: boolean;
  showMap: boolean;
}) {
  const v = data.verdict;
  const now = new Date(data.fetchedAt).getTime();

  return (
    <div className="flex flex-1 flex-col gap-5 sm:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {/* Headline: moon phase + darkness window, pure typography. */}
        <div className="flex items-center gap-4">
          <MoonIcon
            phase={data.moon.phase}
            angle={data.moon.angle}
            size={44}
            className="shrink-0"
          />
          <div className="min-w-0">
            <div className="text-xl font-semibold leading-tight tracking-tight">
              {data.moon.name}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              {Math.round(data.moon.phase * 100)}% illuminated
              {data.moon.altitude > 0 ? " · up tonight" : " · below horizon"}
            </div>
          </div>
          <div className="ml-auto shrink-0 text-right">
            <div className="text-sm font-medium tabular-nums">
              {fmtTime(data.dusk)} – {fmtTime(data.dawn)}
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {data.darkHours.toFixed(1)}h dark
            </div>
          </div>
        </div>

        {/* Verdict reasoning as one quiet line. */}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {v.reasons.join("  ·  ")}
          {stale && <span className="text-amber-400">  ·  stale data</span>}
        </p>

        {data.hourly.length > 0 && (
          <HourlyStrip hourly={data.hourly} now={now} />
        )}
      </div>

      {/* Satellite map: right half on sm+, full-bleed bottom strip on mobile. */}
      {showMap && (
        <CloudMap
          lat={data.observer.lat}
          lon={data.observer.lon}
          fetchedAt={data.fetchedAt}
          className="-mx-4 -mb-4 h-44 sm:mx-0 sm:-mr-4 sm:-mb-4 sm:h-auto sm:w-1/2 sm:shrink-0"
        />
      )}
    </div>
  );
}
