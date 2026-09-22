"use client";

/** Shared chart helpers for finance panels. */

/** "2023-08-31" -> "8/31/23" */
export const fmtAxis = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${+m}/${+day}/${y.slice(2)}`;
};

export const RANGES = ["1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"] as const;
export type Range = (typeof RANGES)[number];

export function cutoffFor(range: Range): string | null {
  const now = new Date();
  switch (range) {
    case "1M": now.setMonth(now.getMonth() - 1); break;
    case "3M": now.setMonth(now.getMonth() - 3); break;
    case "6M": now.setMonth(now.getMonth() - 6); break;
    case "YTD": return `${now.getFullYear()}-01-01`;
    case "1Y": now.setFullYear(now.getFullYear() - 1); break;
    case "5Y": now.setFullYear(now.getFullYear() - 5); break;
    case "ALL": return null;
  }
  return now.toISOString().slice(0, 10);
}

export function RangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div className="flex gap-1">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`rounded px-2 py-0.5 text-xs ${
            value === r
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent/50"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/** "2026-09" -> "9/26" (monthly buckets) */
export const fmtMonthAxis = (p: string) => {
  const [y, m] = p.split("-");
  return `${+m}/${y.slice(2)}`;
};

/** Map a Range to a month count for the analytics API's `months` param. */
export function monthsForRange(range: Range): number {
  switch (range) {
    case "1M": return 1;
    case "3M": return 3;
    case "6M": return 6;
    case "YTD": return new Date().getMonth() + 1;
    case "1Y": return 12;
    case "5Y": return 60;
    case "ALL": return 120; // API cap
  }
}

export const chartTooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: 12,
};
