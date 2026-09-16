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
  ChevronLeft,
  ChevronRight,
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

export function FitsLibrary() {
  const [targets, setTargets] = useState<LibraryTarget[]>([]);
  const [loading, setLoading] = useState(true);
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
    queueMicrotask(load);
  }, [load]);

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
  const [saving, setSaving] = useState<string | null>(null);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
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

  const featured = cover ?? target?.finals[0] ?? null;

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
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
                <button
                  type="button"
                  onClick={() =>
                    setViewerIdx(Math.max(0, target.finals.indexOf(featured)))
                  }
                  title={featured.split(/[\\/]/).pop()}
                  className="block w-full cursor-zoom-in"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgSrc(featured, 1400)}
                    alt={featured}
                    className="max-h-[50vh] w-full rounded-md object-contain bg-muted"
                  />
                </button>
                <OpenFullLink rel={featured} />
              </div>
            )}

            {target.finals.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {target.finals.map((f, i) => {
                  const isCover = f === featured;
                  return (
                    <div key={f} className="group relative">
                      <button
                        type="button"
                        onClick={() => setViewerIdx(i)}
                        title={f.split(/[\\/]/).pop()}
                        className="block w-full cursor-zoom-in"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imgSrc(f, 480)}
                          alt={f}
                          className={`h-36 w-full rounded-md object-cover bg-muted ${
                            isCover ? "ring-2 ring-primary" : ""
                          }`}
                          loading="lazy"
                        />
                      </button>
                      <OpenFullLink rel={f} />
                      <button
                        type="button"
                        onClick={() => pickCover(f)}
                        disabled={saving === f}
                        title={isCover ? "Cover image" : "Set as cover"}
                        className={`absolute right-1.5 top-1.5 rounded-full p-1.5 backdrop-blur transition ${
                          isCover
                            ? "bg-primary text-primary-foreground"
                            : "bg-background/70 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                        }`}
                      >
                        <Star
                          className="size-3.5"
                          fill={isCover ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  );
                })}
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

            <ImageViewer
              finals={target.finals}
              index={viewerIdx}
              onChange={setViewerIdx}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Lightbox for final images — nested Dialog so Esc only closes the viewer. */
function ImageViewer({
  finals,
  index,
  onChange,
}: {
  finals: string[];
  index: number | null;
  onChange: (i: number | null) => void;
}) {
  const rel = index !== null ? finals[index] : null;

  return (
    <Dialog
      open={rel !== null}
      onOpenChange={(open) => !open && onChange(null)}
    >
      <DialogContent className="gap-0 overflow-hidden border-none bg-black/95 p-0 sm:max-w-[92vw]">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {rel ? rel.split(/[\\/]/).pop() : "Image viewer"}
          </DialogTitle>
        </DialogHeader>
        {rel && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc(rel, 2000)}
              alt={rel}
              className="max-h-[82vh] w-full object-contain"
            />

            {finals.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    onChange((index! - 1 + finals.length) % finals.length)
                  }
                  title="Previous"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-2 text-muted-foreground backdrop-blur transition hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange((index! + 1) % finals.length)}
                  title="Next"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/60 p-2 text-muted-foreground backdrop-blur transition hover:text-foreground"
                >
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-10">
              <span className="truncate text-xs text-white/70">
                {rel.split(/[\\/]/).pop()}
                <span className="ml-2 text-white/40">
                  {index! + 1} / {finals.length}
                </span>
              </span>
              <a
                href={imgSrc(rel)}
                target="_blank"
                rel="noopener noreferrer"
                title="Open full image"
                className="pointer-events-auto rounded-full bg-background/70 p-2 text-muted-foreground backdrop-blur transition hover:text-foreground"
              >
                <ArrowUpRight className="size-4" />
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
