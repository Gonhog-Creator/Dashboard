"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { VisibleTarget } from "@/types";

type Track = { t: string; alt: number };

function fmtTransit(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Local library images get a small server-side thumb; remote cutouts are already small. */
function thumbSrc(url: string) {
  return url.startsWith("/api/astro/image") ? `${url}&w=96` : url;
}

export interface TargetListData {
  targets: VisibleTarget[];
  moonTrack: Track[];
}

export function TargetList({
  limit = 15,
  initialData,
}: {
  limit?: number;
  /** Server-rendered snapshot — skips the client fetch when provided. */
  initialData?: TargetListData | null;
}) {
  const [targets, setTargets] = useState<VisibleTarget[]>(
    initialData?.targets ?? []
  );
  const [moonTrack, setMoonTrack] = useState<Track[]>(
    initialData?.moonTrack ?? []
  );
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VisibleTarget | null>(null);

  useEffect(() => {
    if (initialData) return; // server already fetched
    fetch(`/api/astro/targets?limit=${limit}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setTargets(d.targets ?? []);
        setMoonTrack(d.moonTrack ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [limit, initialData]);

  if (loading)
    return <p className="text-sm text-muted-foreground">Computing visibility…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (targets.length === 0)
    return <p className="text-sm text-muted-foreground">No targets up tonight.</p>;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Target</TableHead>
            <TableHead>Common name</TableHead>
            <TableHead className="text-right">Max alt</TableHead>
            <TableHead className="text-right">Transit</TableHead>
            <TableHead className="text-right">&gt;30°</TableHead>
            <TableHead className="text-right">Moon sep</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {targets.map((t) => (
            <TableRow
              key={t.name}
              className="cursor-pointer"
              onClick={() => setSelected(t)}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  {t.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbSrc(t.imageUrl)}
                      alt={t.name}
                      className="size-10 shrink-0 rounded-md object-cover bg-muted"
                      loading="lazy"
                    />
                  ) : (
                    <div className="size-10 shrink-0 rounded-md bg-muted" />
                  )}
                  <span className="font-medium">{t.name}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5">
                    {t.type}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.commonName ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {t.maxAltitude.toFixed(0)}°
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtTransit(t.transitTime)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {t.hoursAbove30.toFixed(1)}h
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {t.moonSeparation}°
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TargetDetail
        target={selected}
        moonTrack={moonTrack}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function TargetDetail({
  target,
  moonTrack,
  onClose,
}: {
  target: VisibleTarget | null;
  moonTrack: Track[];
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        {target && (
          <>
            <DialogHeader>
              <DialogTitle>
                {target.name}
                {target.commonName ? (
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    {target.commonName}
                  </span>
                ) : null}
              </DialogTitle>
              <DialogDescription>
                {target.type}
                {target.magnitude !== null ? ` · mag ${target.magnitude}` : ""}
                {` · score ${target.score}`}
              </DialogDescription>
            </DialogHeader>

            {target.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={
                  target.imageUrl.startsWith("/api/astro/image")
                    ? `${target.imageUrl}&w=900`
                    : target.imageUrl
                }
                alt={target.name}
                className="max-h-64 w-full rounded-md object-contain bg-muted"
              />
            )}

            <AltitudeChart
              track={target.track}
              moonTrack={moonTrack}
              transit={target.transitTime}
            />

            <div className="grid grid-cols-4 gap-2 text-sm">
              <Stat label="Max altitude" value={`${target.maxAltitude.toFixed(0)}°`} />
              <Stat label="Transit" value={fmtTransit(target.transitTime)} />
              <Stat label="Above 30°" value={`${target.hoursAbove30.toFixed(1)}h`} />
              <Stat label="Moon sep" value={`${target.moonSeparation}°`} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Altitude-over-time curve through the night, with the moon's track overlaid. */
function AltitudeChart({
  track,
  moonTrack,
  transit,
}: {
  track: Track[];
  moonTrack: Track[];
  transit: string | null;
}) {
  if (track.length < 2) return null;

  const W = 620;
  const H = 200;
  const PAD = { l: 30, r: 8, t: 10, b: 22 };
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;

  const t0 = new Date(track[0].t).getTime();
  const t1 = new Date(track[track.length - 1].t).getTime();
  const x = (iso: string) =>
    PAD.l + ((new Date(iso).getTime() - t0) / (t1 - t0)) * iw;
  const y = (alt: number) => PAD.t + (1 - Math.max(0, Math.min(90, alt)) / 90) * ih;

  const line = (pts: Track[]) =>
    pts.map((p) => `${x(p.t).toFixed(1)},${y(p.alt).toFixed(1)}`).join(" ");

  // Hour ticks on the x axis
  const ticks: { x: number; label: string }[] = [];
  for (let ms = t0; ms <= t1; ms += 3600_000) {
    const d = new Date(ms);
    ticks.push({
      x: x(d.toISOString()),
      label: d.toLocaleTimeString(undefined, { hour: "numeric" }),
    });
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        Altitude through the night
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md bg-muted/30">
        {/* 30° imaging threshold */}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(30)}
          y2={y(30)}
          className="stroke-amber-400/50"
          strokeDasharray="4 3"
        />
        <text x={PAD.l + 2} y={y(30) - 3} className="fill-amber-400/80" fontSize="9">
          30°
        </text>
        {/* horizon */}
        <line
          x1={PAD.l}
          x2={W - PAD.r}
          y1={y(0)}
          y2={y(0)}
          className="stroke-border"
        />
        {/* moon track */}
        {moonTrack.length > 1 && (
          <polyline
            points={line(moonTrack)}
            fill="none"
            className="stroke-slate-400/60"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        )}
        {/* target track */}
        <polyline
          points={line(track)}
          fill="none"
          className="stroke-emerald-400"
          strokeWidth="2"
        />
        {/* transit marker */}
        {transit && (
          <line
            x1={x(transit)}
            x2={x(transit)}
            y1={PAD.t}
            y2={H - PAD.b}
            className="stroke-emerald-400/40"
            strokeDasharray="2 3"
          />
        )}
        {/* axis labels */}
        {ticks.map((tk) => (
          <text
            key={tk.x}
            x={tk.x}
            y={H - 6}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="9"
          >
            {tk.label}
          </text>
        ))}
        <text x={4} y={y(90) + 8} className="fill-muted-foreground" fontSize="9">
          90°
        </text>
        <text x={8} y={y(0) - 3} className="fill-muted-foreground" fontSize="9">
          0°
        </text>
      </svg>
      <div className="mt-1 flex gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-emerald-400" /> target
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-slate-400/60" /> moon
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
