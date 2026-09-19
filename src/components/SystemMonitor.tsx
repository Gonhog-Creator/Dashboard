"use client";

import { useEffect, useState } from "react";
import { Cpu, HardDrive, MemoryStick, Gpu, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SysData } from "@/lib/system";

function fmtGB(bytes: number) {
  return (bytes / 1e9).toFixed(0);
}

function fmtUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Bar({
  pct,
  warn = 85,
}: {
  pct: number;
  warn?: number;
}) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          pct >= warn ? "bg-red-400" : pct >= 60 ? "bg-amber-400" : "bg-emerald-400"
        )}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export function SystemMonitor({
  initialData,
}: {
  /** Server-rendered snapshot — paints instantly, polling still refreshes. */
  initialData?: SysData | null;
}) {
  const [data, setData] = useState<SysData | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    async function poll() {
      try {
        const r = await fetch("/api/system");
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        if (!dead) setData(d);
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      }
    }
    if (!initialData) poll(); // server-rendered data is fresh — skip first poll
    const id = setInterval(poll, 15000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, [initialData]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-2.5 text-sm">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Cpu className="size-3.5" /> CPU · {data.cores} cores
          </span>
          <span className="tabular-nums">{data.cpu}%</span>
        </div>
        <Bar pct={data.cpu} />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <MemoryStick className="size-3.5" /> RAM
          </span>
          <span className="tabular-nums">
            {fmtGB(data.mem.used)}/{fmtGB(data.mem.total)}GB · {data.mem.usedPct}%
          </span>
        </div>
        <Bar pct={data.mem.usedPct} />
      </div>

      {data.gpu && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Gpu className="size-3.5" /> {data.gpu.name}
            </span>
            <span className="tabular-nums">
              {data.gpu.util}% · {data.gpu.temp}°C
            </span>
          </div>
          <Bar pct={data.gpu.util} />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>VRAM</span>
            <span className="tabular-nums">
              {(data.gpu.memUsed / 1024).toFixed(1)}/
              {(data.gpu.memTotal / 1024).toFixed(0)}GB
            </span>
          </div>
          <Bar pct={(data.gpu.memUsed / data.gpu.memTotal) * 100} />
        </div>
      )}

      {data.disks.map((d) => (
        <div key={d.drive} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <HardDrive className="size-3.5" /> {d.drive}
            </span>
            <span className="tabular-nums">
              {fmtGB(d.free)}GB free · {d.usedPct}%
            </span>
          </div>
          <Bar pct={d.usedPct} warn={90} />
        </div>
      ))}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 className="size-3.5" />
        up {fmtUptime(data.uptimeSec)} · {data.hostname}
      </div>
    </div>
  );
}
