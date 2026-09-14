"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { CalendarEvent } from "@/types";

function formatTime(e: CalendarEvent): string {
  if (e.allDay) return "All day";
  const d = new Date(e.start);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function AgendaView({ days = 2 }: { days?: number }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/calendar?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events ?? []);
        setErrors(d.errors ?? []);
      })
      .finally(() => setLoading(false));
  }, [days]);

  if (loading)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (events.length === 0)
    return (
      <div className="text-sm text-muted-foreground">
        <p>No events{errors.length ? " — calendar sources not configured" : ""}.</p>
        {errors.map((e) => (
          <p key={e} className="text-xs mt-1 text-destructive/80">{e}</p>
        ))}
      </div>
    );

  // Group by day
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = new Date(e.start).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <div className="flex flex-col gap-3">
      {[...groups.entries()].map(([day, evts]) => (
        <div key={day}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            {dayLabel(evts[0].start)}
          </p>
          <ul className="flex flex-col gap-1">
            {evts.map((e) => (
              <li key={e.id} className="flex items-baseline gap-2 text-sm">
                <span className="text-muted-foreground w-16 shrink-0 text-xs">
                  {formatTime(e)}
                </span>
                <span className="flex-1 truncate">{e.title}</span>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 shrink-0"
                >
                  {e.source}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
