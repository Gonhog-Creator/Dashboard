"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Moon, CloudRain, Clock3 } from "lucide-react";
import type { TonightConditions } from "@/types";
import { cn } from "@/lib/utils";

const VERDICT_STYLES: Record<string, string> = {
  GO: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  MARGINAL: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "NO-GO": "bg-red-500/15 text-red-400 border-red-500/30",
  UNKNOWN: "bg-muted text-muted-foreground border-border",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TonightPanel() {
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

  if (error)
    return <p className="text-sm text-destructive">Weather: {error}</p>;
  if (!data)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  const v = data.verdict;
  const avgCloud =
    data.hourly.length > 0
      ? Math.round(
          data.hourly.reduce((a, h) => a + (h.cloudCover ?? 0), 0) /
            data.hourly.length
        )
      : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className={cn("text-base px-3 py-1 font-semibold", VERDICT_STYLES[v.level])}
        >
          {v.level}
        </Badge>
        <span className="text-2xl font-semibold tabular-nums">{v.score}</span>
        {stale && (
          <Badge variant="outline" className="text-amber-400 border-amber-500/30">
            stale
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock3 className="size-3.5" />
          <span>
            {fmtTime(data.dusk)}–{fmtTime(data.dawn)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Moon className="size-3.5" />
          <span>
            {data.moon.name} {Math.round(data.moon.phase * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <CloudRain className="size-3.5" />
          <span>{avgCloud !== null ? `${avgCloud}% cloud` : "—"}</span>
        </div>
      </div>

      <ul className="text-xs text-muted-foreground flex flex-col gap-0.5">
        {v.reasons.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
    </div>
  );
}
