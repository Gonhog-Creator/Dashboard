import type { ContributionWeek } from "@/types";
import { cn } from "@/lib/utils";

const LEVEL_CLASSES = [
  "bg-muted",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function ContributionGraph({ weeks }: { weeks: ContributionWeek[] }) {
  if (weeks.length === 0) return null;

  // Month labels: label a week when its first day starts a new month
  const monthLabels: (string | null)[] = weeks.map((w, i) => {
    const first = w.days[0];
    if (!first) return null;
    const month = Number(first.date.slice(5, 7)) - 1;
    if (i === 0) return MONTHS[month];
    const prev = weeks[i - 1].days[0];
    if (!prev) return null;
    const prevMonth = Number(prev.date.slice(5, 7)) - 1;
    return month !== prevMonth ? MONTHS[month] : null;
  });

  return (
    <div className="flex flex-col gap-1.5 overflow-x-auto pb-1">
      <div className="flex gap-[3px] text-[10px] text-muted-foreground">
        {monthLabels.map((m, i) => (
          <div key={i} className="w-[10px] shrink-0 overflow-visible">
            {m && <span className="whitespace-nowrap">{m}</span>}
          </div>
        ))}
      </div>
      <div className="flex gap-[3px]">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {w.days.map((d) => (
              <div
                key={d.date}
                title={`${d.count} contribution${d.count === 1 ? "" : "s"} on ${d.date}`}
                className={cn("size-[10px] rounded-[2px]", LEVEL_CLASSES[d.level])}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground self-end">
        Less
        {LEVEL_CLASSES.map((c) => (
          <div key={c} className={cn("size-[10px] rounded-[2px]", c)} />
        ))}
        More
      </div>
    </div>
  );
}
