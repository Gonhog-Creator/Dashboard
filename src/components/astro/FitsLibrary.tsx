"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface DbTarget {
  id: string;
  name: string;
  totalFrames: number;
  totalSeconds: number;
  totalBytes: number;
  lastImagedAt: string | null;
  published: boolean;
  sessions: { id: string; date: string; frames: number; seconds: number }[];
}

function fmtHours(seconds: number) {
  return (seconds / 3600).toFixed(1);
}

function fmtGB(bytes: number) {
  return (bytes / 1e9).toFixed(1);
}

export function FitsLibrary() {
  const [targets, setTargets] = useState<DbTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/astro/scan");
    if (res.ok) {
      const d = await res.json();
      setTargets(d.targets ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function triggerScan() {
    setScanning(true);
    const res = await fetch("/api/astro/scan", { method: "POST" });
    const d = await res.json();
    if (res.ok) toast.success(`Scan complete: ${d.message}`);
    else toast.error(`Scan failed: ${d.message}`);
    setScanning(false);
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
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
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No FITS data yet — set the scan path in Settings and run a scan.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Target</TableHead>
              <TableHead className="text-right">Frames</TableHead>
              <TableHead className="text-right">Exposure</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Last imaged</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {targets.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.totalFrames}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtHours(t.totalSeconds)}h
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtGB(t.totalBytes)}GB
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.sessions.length}
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
      )}
    </div>
  );
}
