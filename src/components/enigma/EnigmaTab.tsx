"use client";

import { useEffect, useState } from "react";
import { Binary, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = {
  up: boolean;
  url: string;
  checkedAt: string;
};

const POLL_MS = 10_000;

export function EnigmaTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch("/api/enigma/status")
        .then((r) => r.json())
        .then((d: Status) => alive && setStatus(d))
        .catch(() => alive && setStatus({ up: false, url: "", checkedAt: "" }));
    check();
    const t = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const up = status?.up === true;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <Binary className="size-5 text-primary" />
        <h1 className="text-lg font-semibold tracking-wide">
          OMNICRON // ENIGMA LAB
        </h1>
        <span
          className={cn(
            "ml-1 flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            up
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              up ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/50"
            )}
          />
          {status === null ? "checking" : up ? "running" : "offline"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {up && (
            <>
              <button
                onClick={() => setFrameKey((k) => k + 1)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <RefreshCw className="size-3.5" />
                Reload
              </button>
              <a
                href="/api/enigma/"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <ExternalLink className="size-3.5" />
                Open full view
              </a>
            </>
          )}
        </div>
      </div>

      {up ? (
        <iframe
          key={frameKey}
          src="/api/enigma/"
          title="Omnicron Enigma Lab"
          className="min-h-0 flex-1 rounded-md border border-border bg-background"
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-center">
          <Binary className="size-10 text-muted-foreground/40" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Enigma lab is not running</p>
            <p className="text-xs text-muted-foreground max-w-md">
              This view activates automatically when the lab&apos;s dashboard is
              serving on{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                {status?.url || "http://127.0.0.1:5340"}
              </code>
              . Start it with{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                python -m omnicron serve
              </code>{" "}
              — this page re-checks every {POLL_MS / 1000}s.
            </p>
          </div>
          {status?.checkedAt && (
            <p className="text-[11px] text-muted-foreground/60">
              last checked{" "}
              {new Date(status.checkedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
