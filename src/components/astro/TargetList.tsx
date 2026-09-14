"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { VisibleTarget } from "@/types";

function fmtTransit(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TargetList({ limit = 15 }: { limit?: number }) {
  const [targets, setTargets] = useState<VisibleTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/astro/targets?limit=${limit}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        setTargets(d.targets ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading)
    return <p className="text-sm text-muted-foreground">Computing visibility…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (targets.length === 0)
    return <p className="text-sm text-muted-foreground">No targets up tonight.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Target</TableHead>
          <TableHead className="text-right">Max alt</TableHead>
          <TableHead className="text-right">Transit</TableHead>
          <TableHead className="text-right">&gt;30°</TableHead>
          <TableHead className="text-right">Moon sep</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {targets.map((t) => (
          <TableRow key={t.name}>
            <TableCell>
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <Badge variant="outline" className="text-[10px] px-1.5">
                  {t.type}
                </Badge>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {t.maxAltitude.toFixed(0)}°
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmtTransit(t.transitTime)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {t.hoursAbove30.toFixed(1)}h
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {t.moonSeparation}°
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
