"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Clicking within this window after a completed run asks for confirmation. */
const RECENT_MS = 10 * 60 * 1000;

type StepStatus = "pending" | "running" | "ok" | "skipped" | "error";

interface StepResult {
  ok: boolean;
  skipped?: boolean;
  message: string;
}

interface StepState {
  id: string;
  label: string;
  status: StepStatus;
  message?: string;
}

const STEPS: { id: string; label: string }[] = [
  { id: "weather", label: "Weather" },
  { id: "coc", label: "Clash of Clans" },
  { id: "finance", label: "Finance" },
  { id: "fits", label: "FITS library" },
  { id: "science", label: "Science news" },
  { id: "widgets", label: "Widgets" },
];

async function post(url: string, body?: unknown): Promise<StepResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };
  const message =
    data.message ?? data.error ?? (res.ok ? "ok" : `HTTP ${res.status}`);
  const skipped =
    res.status === 400 && /not configured/i.test(message)
      ? true
      : /^skipped/i.test(message);
  return {
    ok: res.ok && data.ok !== false && !data.error,
    skipped,
    message,
  };
}

async function runJob(key: string): Promise<StepResult> {
  return post("/api/jobs", { key });
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="size-3.5 animate-spin text-primary" />;
    case "ok":
      return <CheckCircle2 className="size-3.5 text-green-500" />;
    case "skipped":
      return <AlertTriangle className="size-3.5 text-yellow-500" />;
    case "error":
      return <XCircle className="size-3.5 text-destructive" />;
    default:
      return (
        <span className="size-3.5 rounded-full border border-border" />
      );
  }
}

export function RefreshTile() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[] | null>(null);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const doneCount = steps?.filter((s) =>
    ["ok", "skipped", "error"].includes(s.status)
  ).length;

  function setStep(id: string, patch: Partial<StepState>) {
    setSteps((prev) =>
      prev
        ? prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
        : prev
    );
  }

  async function apply(id: string, fn: () => Promise<StepResult>) {
    setStep(id, { status: "running" });
    try {
      const r = await fn();
      setStep(id, {
        status: r.skipped ? "skipped" : r.ok ? "ok" : "error",
        message: r.message,
      });
    } catch (e) {
      setStep(id, {
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function refreshAll() {
    if (running) return;
    setRunning(true);
    setSteps(
      STEPS.map((s) => ({ id: s.id, label: s.label, status: "pending" }))
    );

    // Sequential: gentler on rate limits and each step gets its own line.
    await apply("weather", () => runJob("weather"));
    await apply("coc", () => post("/api/coc/sync?what=all"));
    await apply("finance", () => post("/api/finance/sync"));
    await apply("fits", () => runJob("fits-scan"));
    await apply("science", () => runJob("science-news"));

    // Live widgets (agenda, tasks, system) refresh via server re-render.
    setStep("widgets", { status: "running" });
    router.refresh();
    setStep("widgets", { status: "ok", message: "reloaded" });

    setLastRunAt(Date.now());
    setRunning(false);
  }

  function handleClick() {
    if (running) return;
    if (lastRunAt && Date.now() - lastRunAt < RECENT_MS) {
      setConfirming(true);
      return;
    }
    void refreshAll();
  }

  const minsAgo = lastRunAt
    ? Math.max(0, Math.floor((Date.now() - lastRunAt) / 60000))
    : null;
  const agoText =
    minsAgo === null ? null : minsAgo < 1 ? "just now" : `${minsAgo} min ago`;

  // Idle state: the whole tile is the button.
  const body = !steps ? (
    <button
      onClick={handleClick}
      className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <RefreshCw className="size-8 text-primary" />
      <span className="text-sm font-medium text-foreground">Refresh all</span>
      <span className="px-3 text-center text-xs">
        weather · clash · finance · library · science
      </span>
    </button>
  ) : (
    <div className="flex h-full w-full flex-col gap-1.5 p-1 text-left">
      <div className="flex flex-col gap-1">
        {steps.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 text-xs">
            <StepIcon status={s.status} />
            <span
              className={cn(
                "shrink-0",
                s.status === "pending" && "text-muted-foreground",
                s.status === "running" && "text-foreground"
              )}
            >
              {s.label}
            </span>
            {s.message && s.status !== "pending" && s.status !== "running" && (
              <span className="truncate text-[10px] text-muted-foreground">
                {s.message}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
        <span>
          {running
            ? `Refreshing ${doneCount}/${steps.length}…`
            : `${doneCount}/${steps.length} done`}
        </span>
        {!running && (
          <button
            onClick={handleClick}
            className="text-foreground underline-offset-2 hover:underline"
          >
            run again
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative h-full w-full">
      {body}
      {confirming && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-popover p-2 text-center shadow-lg">
          <p className="text-xs text-popover-foreground">
            Refreshed {agoText} — run again?
          </p>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setConfirming(false);
                void refreshAll();
              }}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
