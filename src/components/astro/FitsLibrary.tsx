"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowUpRight,
  ChevronDown,
  RefreshCw,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import type { LibraryTarget } from "@/types";
import { cn } from "@/lib/utils";

const MIN_SECONDS = 3600; // hide targets under 1h of integration

function fmtHours(seconds: number) {
  return (seconds / 3600).toFixed(1);
}

function fmtGB(bytes: number) {
  return (bytes / 1e9).toFixed(1);
}

function fmtSubs(seconds: number | null) {
  if (seconds === null) return "—";
  return seconds >= 60 ? `${(seconds / 60).toFixed(1)}m` : `${seconds}s`;
}

function imgSrc(rel: string, w?: number) {
  const p = `path=${encodeURIComponent(rel)}`;
  return `/api/astro/image?${p}${w ? `&w=${w}` : ""}`;
}

/** Hours baked into a filename, e.g. "M31_12.5h_final.jpg" -> 12.5. */
function hoursFromName(rel: string): number | null {
  const base = rel.split(/[\\/]/).pop() ?? rel;
  const m = base.match(/(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?\b/i);
  return m ? parseFloat(m[1]) : null;
}

/** "2026-03-03" -> "Mar 3, 2026" (noon anchor avoids TZ day-shift). */
function fmtDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Frosted bottom-right button that opens the full-res image in a new tab. */
function OpenFullLink({ rel }: { rel: string }) {
  return (
    <a
      href={imgSrc(rel)}
      target="_blank"
      rel="noopener noreferrer"
      title="Open full image"
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-1.5 right-1.5 rounded-full bg-background/70 p-1.5 text-muted-foreground backdrop-blur transition hover:text-foreground"
    >
      <ArrowUpRight className="size-3.5" />
    </a>
  );
}

export function FitsLibrary({
  initialTargets,
}: {
  /** Server-rendered snapshot — skips the client fetch when provided. */
  initialTargets?: LibraryTarget[] | null;
}) {
  const [targets, setTargets] = useState<LibraryTarget[]>(
    initialTargets ?? []
  );
  const [loading, setLoading] = useState(!initialTargets);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<LibraryTarget | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/astro/scan");
    if (res.ok) {
      const d = await res.json();
      setTargets(d.targets ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialTargets) return; // server already fetched
    queueMicrotask(load);
  }, [load, initialTargets]);

  async function triggerScan() {
    setScanning(true);
    const res = await fetch("/api/astro/scan", { method: "POST" });
    const d = await res.json();
    if (res.ok) toast.success(`Scan complete: ${d.message}`);
    else toast.error(`Scan failed: ${d.message}`);
    setScanning(false);
    load();
  }

  const visible = targets.filter((t) => t.totalSeconds >= MIN_SECONDS);
  const mid = Math.ceil(visible.length / 2);
  const columns = [visible.slice(0, mid), visible.slice(mid)];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {visible.length} targets ≥1h
          {targets.length > visible.length &&
            ` (${targets.length - visible.length} shorter hidden)`}
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={triggerScan}
          disabled={scanning}
        >
          <RefreshCw className={scanning ? "size-3.5 animate-spin" : "size-3.5"} />
          {scanning ? "Scanning…" : "Scan now"}
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No targets with 1h+ of integration — set the scan path in Settings and
          run a scan.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-0 xl:grid-cols-2">
          {columns.map((col, i) => (
            <Table key={i}>
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Common name</TableHead>
                  <TableHead className="text-right">Frames</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Last</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {col.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(t)}
                  >
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{t.name}</span>
                        {t.scopes.map((s) => (
                          <Badge
                            key={s}
                            variant="outline"
                            className="text-[10px] px-1.5"
                          >
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-32 truncate text-muted-foreground">
                      {t.commonName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.totalFrames}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtHours(t.totalSeconds)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {t.lastImagedAt
                        ? new Date(t.lastImagedAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ))}
        </div>
      )}

      <TargetDetail
        key={selected?.id ?? "none"}
        target={selected}
        onClose={() => setSelected(null)}
        onCover={(name, rel) =>
          setTargets((ts) =>
            ts.map((t) => (t.name === name ? { ...t, cover: rel } : t))
          )
        }
      />
    </div>
  );
}

function TargetDetail({
  target,
  onClose,
  onCover,
}: {
  target: LibraryTarget | null;
  onClose: () => void;
  onCover: (name: string, rel: string) => void;
}) {
  const [cover, setCover] = useState<string | null>(target?.cover ?? null);
  const [viewed, setViewed] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedFilter, setExpandedFilter] = useState<string | null>(null);

  async function pickCover(rel: string) {
    if (!target || saving) return;
    setSaving(rel);
    const res = await fetch("/api/astro/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: target.name, path: rel }),
    });
    setSaving(null);
    if (res.ok) {
      setCover(rel);
      onCover(target.name, rel);
      toast.success("Cover updated");
    } else {
      const d = await res.json().catch(() => null);
      toast.error(`Cover failed: ${d?.error ?? res.status}`);
    }
  }

  const featured = viewed ?? cover ?? target?.finals[0] ?? null;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto scrollbar-hidden">
        {target && (
          <>
            <DialogHeader>
              <DialogTitle>{target.name}</DialogTitle>
              <DialogDescription>
                {[
                  target.aliases.length
                    ? `also as ${target.aliases.join(", ")}`
                    : null,
                  target.scopes.length ? target.scopes.join(" + ") : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "FITS library target"}
              </DialogDescription>
            </DialogHeader>

            {featured && (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgSrc(featured, 1400)}
                  alt={featured}
                  title={featured.split(/[\\/]/).pop()}
                  className="max-h-[50vh] w-full rounded-md object-contain bg-muted"
                />
                <OpenFullLink rel={featured} />
              </div>
            )}

            {target.finals.length > 0 ? (
              <div
                className={
                  target.finals.length > 3
                    ? "flex gap-2 overflow-x-auto pb-1 scrollbar-hidden"
                    : "grid grid-cols-3 gap-2"
                }
                onWheel={(e) => {
                  // Vertical wheel scrolls the filmstrip horizontally.
                  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
                  e.currentTarget.scrollLeft += e.deltaY;
                  e.preventDefault();
                }}
              >
                {target.finals.map((f) => (
                  <FinalThumb
                    key={f}
                    rel={f}
                    isViewed={f === featured}
                    isCover={f === cover}
                    saving={saving === f}
                    compact={target.finals.length > 3}
                    onView={() => setViewed(f)}
                    onCover={() => pickCover(f)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No final images matched in Finals/.
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 text-sm">
              <Stat label="Integration" value={`${fmtHours(target.totalSeconds)}h`} />
              <Stat label="Frames" value={String(target.totalFrames)} />
              <Stat label="Size" value={`${fmtGB(target.totalBytes)}GB`} />
            </div>

            {target.scopeBreakdown.length > 1 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {target.scopeBreakdown.map((s) => (
                  <span key={s.scope}>
                    <span className="font-medium text-foreground">
                      {s.scope}
                    </span>{" "}
                    {fmtHours(s.seconds)}h · {s.frames}×
                  </span>
                ))}
              </div>
            )}

            {target.filters.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Filters
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filter</TableHead>
                      <TableHead className="text-right">Frames</TableHead>
                      <TableHead className="text-right">Subs</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {target.filters.map((f) => {
                      const open = expandedFilter === f.filter;
                      return (
                        <Fragment key={f.filter}>
                          <TableRow
                            className="cursor-pointer"
                            onClick={() =>
                              setExpandedFilter(open ? null : f.filter)
                            }
                          >
                            <TableCell>
                              <span className="flex items-center gap-1">
                                <ChevronDown
                                  className={cn(
                                    "size-3.5 text-muted-foreground transition-transform",
                                    open && "rotate-180"
                                  )}
                                />
                                {f.filter}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {f.frames}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtSubs(f.subSeconds)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtHours(f.seconds)}h
                            </TableCell>
                          </TableRow>
                          {open && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell
                                colSpan={4}
                                className="bg-muted/30 py-2"
                              >
                                {!f.dates ? (
                                  <p className="text-xs text-muted-foreground">
                                    Run a new scan for per-date detail.
                                  </p>
                                ) : f.dates.length === 1 ? (
                                  <p className="text-xs text-muted-foreground">
                                    All {f.dates[0].frames}× taken on{" "}
                                    {fmtDate(f.dates[0].date)}
                                  </p>
                                ) : (
                                  <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                                    {f.dates.map((d) => (
                                      <li
                                        key={d.date}
                                        className="flex justify-between"
                                      >
                                        <span>{fmtDate(d.date)}</span>
                                        <span className="tabular-nums">
                                          {d.frames}× · {fmtHours(d.seconds)}h
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {target.sessions.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Sessions
                </p>
                <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  {target.sessions.map((s) => (
                    <li key={s.id} className="flex justify-between">
                      <span>{s.date}</span>
                      <span className="tabular-nums">
                        {s.frames}× · {fmtHours(s.seconds)}h
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One final-image thumbnail; `compact` = fixed-width filmstrip cell. */
function FinalThumb({
  rel,
  isViewed,
  isCover,
  saving,
  compact,
  onView,
  onCover,
}: {
  rel: string;
  isViewed: boolean;
  isCover: boolean;
  saving: boolean;
  compact: boolean;
  onView: () => void;
  onCover: () => void;
}) {
  const hours = hoursFromName(rel);
  return (
    <div className={cn("group relative", compact && "w-44 shrink-0")}>
      <button
        type="button"
        onClick={onView}
        title={rel.split(/[\\/]/).pop()}
        className="block w-full"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc(rel, 480)}
          alt={rel}
          className={cn(
            "w-full rounded-md object-cover bg-muted",
            compact ? "h-28" : "h-36",
            isViewed && "ring-2 ring-primary"
          )}
          loading="lazy"
        />
      </button>
      {hours !== null && (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground backdrop-blur">
          {hours}h
        </span>
      )}
      <OpenFullLink rel={rel} />
      <button
        type="button"
        onClick={onCover}
        disabled={saving}
        title={isCover ? "Cover image" : "Set as cover"}
        className={`absolute right-1.5 top-1.5 rounded-full p-1.5 backdrop-blur transition ${
          isCover
            ? "bg-primary text-primary-foreground"
            : "bg-background/70 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
        }`}
      >
        <Star className="size-3.5" fill={isCover ? "currentColor" : "none"} />
      </button>
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
