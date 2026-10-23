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
  Search,
  Star,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { LibraryTarget, MosaicPanel } from "@/types";
import { cn } from "@/lib/utils";

const MIN_SECONDS = 3600; // hide targets under 1h of integration

type ScanProgress = {
  running: boolean;
  phase: "idle" | "enumerating" | "parsing" | "finals" | "done";
  done: number;
  total: number;
};

/** One row in the post-scan changes modal. */
interface TargetDelta {
  name: string;
  status: "new" | "removed" | "updated";
  framesDelta: number;
  secondsDelta: number;
  bytesDelta: number;
  /** Per-filter frame delta, e.g. "L +38". */
  filterDeltas: string[];
  newFinals: number;
}

/** Signed duration like +1h 42m / −48m. */
function fmtDeltaHours(seconds: number) {
  const sign = seconds < 0 ? "\u2212" : "+";
  return `${sign}${fmtHours(Math.abs(seconds))}`;
}

function fmtDeltaInt(v: number) {
  return v < 0 ? `\u2212${Math.abs(v)}` : `+${v}`;
}

/** Diff the pre-scan target list against the post-scan one. */
function diffScan(prev: LibraryTarget[], next: LibraryTarget[]) {
  const byName = new Map(prev.map((t) => [t.name, t]));
  const deltas: TargetDelta[] = [];
  for (const t of next) {
    const p = byName.get(t.name);
    if (!p) {
      deltas.push({
        name: t.name,
        status: "new",
        framesDelta: t.totalFrames,
        secondsDelta: t.totalSeconds,
        bytesDelta: t.totalBytes,
        filterDeltas: t.filters.map((f) => `${f.filter} ${f.frames}`),
        newFinals: t.finals.length,
      });
      continue;
    }
    const framesDelta = t.totalFrames - p.totalFrames;
    const secondsDelta = t.totalSeconds - p.totalSeconds;
    const bytesDelta = t.totalBytes - p.totalBytes;
    const prevFinals = new Set(p.finals);
    const newFinals = t.finals.filter((f) => !prevFinals.has(f)).length;
    const prevFilters = new Map(p.filters.map((f) => [f.filter, f.frames]));
    const filterDeltas = t.filters
      .map((f) => ({ f, d: f.frames - (prevFilters.get(f.filter) ?? 0) }))
      .filter((x) => x.d !== 0)
      .map((x) => `${x.f.filter} ${fmtDeltaInt(x.d)}`);
    if (framesDelta !== 0 || secondsDelta !== 0 || bytesDelta !== 0 || newFinals > 0)
      deltas.push({
        name: t.name,
        status: "updated",
        framesDelta,
        secondsDelta,
        bytesDelta,
        filterDeltas,
        newFinals,
      });
  }
  const nextNames = new Set(next.map((t) => t.name));
  for (const p of prev) {
    if (!nextNames.has(p.name))
      deltas.push({
        name: p.name,
        status: "removed",
        framesDelta: -p.totalFrames,
        secondsDelta: -p.totalSeconds,
        bytesDelta: -p.totalBytes,
        filterDeltas: [],
        newFinals: 0,
      });
  }
  deltas.sort((a, b) => Math.abs(b.secondsDelta) - Math.abs(a.secondsDelta));
  return {
    deltas,
    addedFrames: deltas.reduce((s, d) => s + Math.max(0, d.framesDelta), 0),
    addedSeconds: deltas.reduce((s, d) => s + Math.max(0, d.secondsDelta), 0),
  };
}

/** Duration like "1h 42m" (or "42m" under an hour). */
function fmtHours(seconds: number) {
  const mins = Math.round(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [selected, setSelected] = useState<LibraryTarget | null>(null);
  const [query, setQuery] = useState("");
  const [scanDiff, setScanDiff] = useState<ReturnType<
    typeof diffScan
  > | null>(null);

  const load = useCallback(async (): Promise<LibraryTarget[]> => {
    const res = await fetch("/api/astro/scan");
    let t: LibraryTarget[] = [];
    if (res.ok) {
      const d = await res.json();
      t = d.targets ?? [];
      setTargets(t);
    }
    setLoading(false);
    return t;
  }, []);

  useEffect(() => {
    if (initialTargets) return; // server already fetched
    queueMicrotask(load);
  }, [load, initialTargets]);

  async function triggerScan() {
    setScanning(true);
    setProgress({ running: true, phase: "enumerating", done: 0, total: 0 });
    const before = targets; // snapshot for the post-scan diff
    // Poll the shared progress snapshot while the scan runs server-side.
    const timer = setInterval(async () => {
      const r = await fetch("/api/astro/scan/progress").catch(() => null);
      if (r?.ok) setProgress(await r.json());
    }, 500);
    let ok = false;
    try {
      const res = await fetch("/api/astro/scan", { method: "POST" });
      const d = await res.json();
      ok = res.ok;
      if (res.ok) toast.success(`Scan complete: ${d.message}`);
      else toast.error(`Scan failed: ${d.message}`);
    } finally {
      clearInterval(timer);
      setScanning(false);
      setProgress(null);
      const next = await load();
      if (ok) {
        const diff = diffScan(before, next);
        if (diff.deltas.length) setScanDiff(diff);
      }
    }
  }

  const q = query.trim().toLowerCase();
  // While searching, drop the ≥1h gate so short sessions are findable too.
  const visible = q
    ? targets.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.commonName?.toLowerCase().includes(q) ||
          t.aliases.some((a) => a.toLowerCase().includes(q))
      )
    : targets.filter((t) => t.totalSeconds >= MIN_SECONDS);
  const mid = Math.ceil(visible.length / 2);
  const columns = [visible.slice(0, mid), visible.slice(mid)];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {q
            ? `${visible.length} match${visible.length === 1 ? "" : "es"}`
            : `${visible.length} targets ≥1h${
                targets.length > visible.length
                  ? ` (${targets.length - visible.length} shorter hidden)`
                  : ""
              }`}
        </span>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search targets…"
            className="h-7 w-44 pl-7 text-xs"
          />
        </div>
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
      {progress && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            {/* No indeterminate fill — a fake 33% reads as real progress. The
                phase label carries the status while total is unknown. */}
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width:
                  progress.phase === "parsing" && progress.total > 0
                    ? `${Math.round((progress.done / progress.total) * 100)}%`
                    : progress.phase === "finals" || progress.phase === "done"
                      ? "100%"
                      : "0%",
              }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {progress.phase === "parsing" && progress.total > 0
              ? `${progress.done}/${progress.total} files`
              : progress.phase === "finals"
                ? "matching finals…"
                : progress.phase === "enumerating"
                  ? "enumerating…"
                  : "starting…"}
          </span>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q
            ? `No targets match "${query.trim()}".`
            : "No targets with 1h+ of integration — set the scan path in Settings and run a scan."}
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

      <Dialog
        open={scanDiff !== null}
        onOpenChange={(open) => !open && setScanDiff(null)}
      >
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Changes since last scan</DialogTitle>
            {scanDiff && (
              <DialogDescription>
                {scanDiff.deltas.length} target
                {scanDiff.deltas.length === 1 ? "" : "s"} changed ·{" "}
                {fmtDeltaInt(scanDiff.addedFrames)} files ·{" "}
                {fmtDeltaHours(scanDiff.addedSeconds)} integration
              </DialogDescription>
            )}
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {scanDiff?.deltas.map((d) => (
              <li
                key={d.name}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">
                    {d.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                      d.status === "new" &&
                        "bg-green-500/15 text-green-400",
                      d.status === "removed" &&
                        "bg-red-500/15 text-red-400",
                      d.status === "updated" &&
                        "bg-muted text-muted-foreground"
                    )}
                  >
                    {d.status === "updated"
                      ? `${fmtDeltaInt(d.framesDelta)} files`
                      : d.status}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {d.status !== "removed" && (
                    <>
                      {fmtDeltaInt(d.framesDelta)} files ·{" "}
                      {fmtDeltaHours(d.secondsDelta)} ·{" "}
                      {fmtDeltaInt(Math.round(d.bytesDelta / 1e6))}MB
                    </>
                  )}
                  {d.newFinals > 0 && (
                    <span>
                      {" "}
                      · {d.newFinals} new final{d.newFinals === 1 ? "" : "s"}
                    </span>
                  )}
                </p>
                {d.filterDeltas.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {d.filterDeltas.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
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
              <Stat label="Integration" value={fmtHours(target.totalSeconds)} />
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
                    {fmtHours(s.seconds)} · {s.frames}×
                  </span>
                ))}
              </div>
            )}

            {target.panels.length > 0 && <PanelGrid panels={target.panels} />}

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
                              {f.exptimes && f.exptimes.length > 0
                                ? f.exptimes
                                    .map(
                                      (e) => `${fmtSubs(e.seconds)}×${e.frames}`
                                    )
                                    .join(" + ")
                                : fmtSubs(f.subSeconds)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtHours(f.seconds)}
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
                                          {d.frames}× · {fmtHours(d.seconds)}
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
                        {s.frames}× · {fmtHours(s.seconds)}
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

/**
 * Mosaic panels laid out on their R-C grid. Gaps inside the bounding grid
 * render as dashed cells so missing panels are obvious at a glance.
 */
function PanelGrid({ panels }: { panels: MosaicPanel[] }) {
  const byPos = new Map(panels.map((p) => [`${p.row}-${p.col}`, p]));
  const maxRow = Math.max(...panels.map((p) => p.row));
  const maxCol = Math.max(...panels.map((p) => p.col));
  const cells = [];
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const p = byPos.get(`${r}-${c}`);
      cells.push(
        p ? (
          <div key={`${r}-${c}`} className="rounded-md bg-muted/50 px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-xs font-medium tabular-nums">
                {r}-{c}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {fmtHours(p.seconds)}
              </span>
            </div>
            <p className="text-[10px] leading-4 text-muted-foreground">
              {p.filters.map((f) => `${f.filter} ×${f.frames}`).join(" · ")}
            </p>
          </div>
        ) : (
          <div
            key={`${r}-${c}`}
            className="rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] tabular-nums text-muted-foreground/50"
          >
            {r}-{c}
          </div>
        )
      );
    }
  }
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        Mosaic panels
      </p>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${maxCol}, minmax(0, 1fr))` }}
      >
        {cells}
      </div>
    </div>
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
