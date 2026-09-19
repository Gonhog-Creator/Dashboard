"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/types";
import { cn } from "@/lib/utils";

const HOUR_PX = 48;
const MIN_BLOCK_PX = 18;
const DEFAULT_START_H = 7;
const DEFAULT_END_H = 22;

const SOURCE_CHIP: Record<CalendarEvent["source"], string> = {
  google: "bg-sky-500/15 ring-sky-400/30 text-sky-200",
  apple: "bg-rose-500/15 ring-rose-400/30 text-rose-200",
  local: "bg-amber-500/15 ring-amber-400/30 text-amber-200",
};

/** Date-only strings ("2026-09-16") must parse as local midnight, not UTC. */
function parseDate(iso: string): Date {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(iso);
}

function dayStart(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

interface Segment {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  lane: number;
  lanes: number;
}

/** Clamp a timed event into a single day's [0, 1440] minute window. */
function segmentsForDay(
  events: CalendarEvent[],
  day: Date
): Segment[] {
  const t0 = dayStart(day).getTime();
  const t1 = t0 + 86400_000;
  const segs: Segment[] = [];

  for (const e of events) {
    if (e.allDay) continue;
    const s = parseDate(e.start).getTime();
    const en = parseDate(e.end).getTime();
    if (en <= t0 || s >= t1) continue;
    segs.push({
      event: e,
      startMin: Math.max(0, (Math.max(s, t0) - t0) / 60000),
      endMin: Math.min(1440, (Math.min(en, t1) - t0) / 60000),
      lane: 0,
      lanes: 1,
    });
  }

  // Lane assignment for overlapping events.
  segs.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const laneEnds: number[] = [];
  for (const s of segs) {
    let lane = laneEnds.findIndex((end) => end <= s.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = s.endMin;
    s.lane = lane;
  }
  for (const s of segs) s.lanes = laneEnds.length;
  return segs;
}

function allDayForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const t0 = dayStart(day).getTime();
  return events.filter((e) => {
    if (!e.allDay) return false;
    const s = dayStart(parseDate(e.start)).getTime();
    // All-day end dates are exclusive (RFC 5545 / Google convention).
    const en = dayStart(parseDate(e.end)).getTime();
    return t0 >= s && t0 < Math.max(en, s + 86400_000);
  });
}

export function WeekView({
  weekStart,
  nowIso,
  initialData,
}: {
  /** YYYY-MM-DD of the first (Sunday) column. */
  weekStart: string;
  /** Server-rendered "now" so the client doesn't call Date() in render. */
  nowIso: string;
  /** Server-rendered snapshot for this weekStart — skips the client fetch. */
  initialData?: { events: CalendarEvent[]; errors: string[] } | null;
}) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(
    initialData?.events ?? null
  );
  const [errors, setErrors] = useState<string[]>(initialData?.errors ?? []);
  const [now, setNow] = useState(() => new Date(nowIso));
  const gridRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);

  useEffect(() => {
    if (initialData) return; // server already fetched this week
    fetch(`/api/calendar?from=${weekStart}&days=7`)
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events ?? []);
        setErrors(d.errors ?? []);
      })
      .catch(() => setEvents([]));
  }, [weekStart, initialData]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Track the scroll container's height so hours can stretch to fill it.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const first = parseDate(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Expand the visible hour range to fit the week's timed events.
  let startH = DEFAULT_START_H;
  let endH = DEFAULT_END_H;
  for (const e of events ?? []) {
    if (e.allDay) continue;
    const s = parseDate(e.start);
    const en = parseDate(e.end);
    startH = Math.min(startH, s.getHours());
    endH = Math.max(endH, en.getHours() + (en.getMinutes() > 0 ? 1 : 0));
  }
  startH = Math.max(0, startH);
  endH = Math.min(24, Math.max(endH, startH + 1));
  const rangeMin = (endH - startH) * 60;
  // Stretch hours to fill the container; never below HOUR_PX (scrolls instead).
  const hourPx = Math.max(
    HOUR_PX,
    containerH > 0 ? containerH / (endH - startH) : 0
  );
  const gridH = (rangeMin / 60) * hourPx;

  const nowMin = now.getHours() * 60 + now.getMinutes() - startH * 60;
  const showNowLine =
    days.some((d) => sameDay(d, now)) && nowMin >= 0 && nowMin <= rangeMin;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {errors.length > 0 && (
        <p className="mb-2 text-xs text-destructive/80">
          {errors.join(" · ")}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
        <div className="flex min-h-0 min-w-[760px] flex-1 flex-col">
          {/* Day header */}
          <div className="grid grid-cols-[44px_repeat(7,1fr)] border-b border-border">
            <div />
            {days.map((d) => {
              const today = sameDay(d, now);
              return (
                <div
                  key={d.toISOString()}
                  className="flex flex-col items-center gap-0.5 pb-2 pt-1"
                >
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {d.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-sm tabular-nums",
                      today
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "text-foreground"
                    )}
                  >
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* All-day row */}
          <div className="grid grid-cols-[44px_repeat(7,1fr)] border-b border-border">
            <div className="pr-2 pt-1 text-right text-[10px] text-muted-foreground">
              all-day
            </div>
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className="flex min-h-6 flex-col gap-0.5 border-l border-border/50 px-0.5 py-0.5"
              >
                {allDayForDay(events ?? [], d).map((e) => (
                  <div
                    key={e.id}
                    title={e.title}
                    className={cn(
                      "truncate rounded px-1.5 py-0.5 text-[11px] leading-tight ring-1",
                      SOURCE_CHIP[e.source]
                    )}
                  >
                    {e.title}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div ref={gridRef} className="flex min-h-0 flex-1 overflow-y-auto">
            {/* Hour gutter */}
            <div className="relative w-11 shrink-0" style={{ height: gridH }}>
              {Array.from({ length: endH - startH }, (_, i) => (
                <span
                  key={i}
                  className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: i * hourPx }}
                >
                  {i > 0 &&
                    new Date(2000, 0, 1, startH + i).toLocaleTimeString(
                      undefined,
                      { hour: "numeric" }
                    )}
                </span>
              ))}
            </div>

            {/* Day columns */}
            <div className="relative grid flex-1 grid-cols-7">
              {/* Hour lines */}
              {Array.from({ length: endH - startH + 1 }, (_, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute inset-x-0 border-t border-border/50"
                  style={{ top: i * hourPx }}
                />
              ))}

              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  className="relative border-l border-border/50"
                  style={{ height: gridH }}
                >
                  {segmentsForDay(events ?? [], d).map((s) => {
                    // Clamp into the visible [startH, endH] window, then
                    // position relative to startH (startMin is from midnight).
                    const vStart = Math.max(s.startMin, startH * 60);
                    const vEnd = Math.min(s.endMin, endH * 60);
                    if (vEnd <= vStart) return null;
                    return (
                    <div
                      key={s.event.id}
                      title={`${s.event.title}${
                        s.event.location ? ` — ${s.event.location}` : ""
                      }`}
                      className={cn(
                        "absolute overflow-hidden rounded px-1.5 py-0.5 text-[11px] leading-tight ring-1",
                        SOURCE_CHIP[s.event.source]
                      )}
                      style={{
                        top: ((vStart - startH * 60) / 60) * hourPx,
                        height: Math.max(
                          ((vEnd - vStart) / 60) * hourPx,
                          MIN_BLOCK_PX
                        ),
                        left: `calc(${(s.lane / s.lanes) * 100}% + 1px)`,
                        width: `calc(${100 / s.lanes}% - 2px)`,
                      }}
                    >
                      <div className="truncate font-medium">
                        {s.event.title}
                      </div>
                      {s.endMin - s.startMin >= 30 && (
                        <div className="truncate opacity-70">
                          {parseDate(s.event.start).toLocaleTimeString(
                            undefined,
                            { hour: "numeric", minute: "2-digit" }
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}

                  {/* Now line */}
                  {showNowLine && sameDay(d, now) && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10"
                      style={{ top: (nowMin / 60) * hourPx }}
                    >
                      <div className="relative border-t-2 border-red-500">
                        <div className="absolute -left-1 -top-[4px] size-1.5 rounded-full bg-red-500" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {events && events.length === 0 && errors.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          No events this week.
        </p>
      )}
    </div>
  );
}
