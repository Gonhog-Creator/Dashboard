"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface JobRunRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  message: string | null;
}

interface JobRow {
  id: string;
  key: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
  runs: JobRunRow[];
}

const STATUS_STYLES: Record<string, string> = {
  ok: "text-emerald-400",
  error: "text-red-400",
  running: "text-amber-400",
};

export function JobPanel() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/jobs");
    if (res.ok) {
      const d = await res.json();
      setJobs(d.jobs ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  async function trigger(key: string) {
    setRunning(key);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const d = await res.json();
    if (res.ok) toast.success(`${key}: ${d.message}`);
    else toast.error(`${key}: ${d.message}`);
    setRunning(null);
    load();
  }

  if (loading)
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (jobs.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No jobs registered yet — they appear after the scheduler starts.
      </p>
    );

  return (
    <ul className="flex flex-col gap-2">
      {jobs.map((j) => (
        <li
          key={j.key}
          className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{j.name}</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {j.schedule}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {j.lastRunAt
                ? `${new Date(j.lastRunAt).toLocaleString()} — ${j.lastMessage ?? ""}`
                : "never run"}
            </p>
          </div>
          <span
            className={cn(
              "text-xs font-medium",
              STATUS_STYLES[j.lastStatus ?? ""] ?? "text-muted-foreground"
            )}
          >
            {j.lastStatus ?? "—"}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={running === j.key}
            onClick={() => trigger(j.key)}
          >
            <Play className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
