"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

interface Report {
  id: string;
  type: string;
  title: string;
  content: string;
  source: string;
  model: string | null;
  generatedAt: string;
}

export function ReportList({ limit = 20 }: { limit?: number }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/reports?limit=${limit}`)
      .then((r) => r.json())
      .then((d) => setReports(d.reports ?? []))
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading)
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (reports.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No reports yet — the morning-briefing job runs at 6am once an AI
        provider is configured, and external automations can POST to{" "}
        <code>/api/reports/ingest</code>.
      </p>
    );

  return (
    <ul className="flex flex-col gap-2">
      {reports.map((r) => (
        <li key={r.id} className="rounded-md border border-border">
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/50"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
          >
            <span className="flex-1 text-sm font-medium truncate">
              {r.title}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {r.type}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {r.source}
            </Badge>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {new Date(r.generatedAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </button>
          {expanded === r.id && (
            <div className="border-t border-border px-3 py-2 text-sm whitespace-pre-wrap text-muted-foreground">
              {r.content}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
