"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export interface NeedsUpdateItem {
  id: string;
  name: string;
  catalogName: string | null;
  totalSeconds: number;
  totalFrames: number;
  lastImagedAt: string | null;
}

export interface NeedsUpdateResponse {
  needsUpdate: NeedsUpdateItem[];
  publishedCount: number;
  scannedCount: number;
  error: string | null;
}

export function NeedsUpdateList({
  limit,
  initialData,
}: {
  limit?: number;
  /** Server-rendered snapshot — skips the client fetch when provided. */
  initialData?: NeedsUpdateResponse | null;
}) {
  const [data, setData] = useState<NeedsUpdateResponse | null>(
    initialData ?? null
  );
  const [loading, setLoading] = useState(!initialData);

  const load = useCallback(async () => {
    const res = await fetch("/api/astro/needs-update");
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (initialData) return; // server already fetched
    queueMicrotask(load);
  }, [load, initialData]);

  async function markPublished(id: string) {
    await fetch(`/api/astro/targets/${id}/publish`, { method: "POST" });
    load();
  }

  if (loading)
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data) return null;

  if (data.error)
    return (
      <p className="text-sm text-muted-foreground">
        Can&apos;t reach PersonalWebsite data: {data.error}
      </p>
    );

  if (data.needsUpdate.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        All imaged targets are published ({data.scannedCount} scanned,{" "}
        {data.publishedCount} on site).
      </p>
    );

  const items = limit ? data.needsUpdate.slice(0, limit) : data.needsUpdate;
  const remaining = data.needsUpdate.length - items.length;

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((t) => (
        <li
          key={t.id}
          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
        >
          <span className="flex-1 text-sm font-medium truncate">{t.name}</span>
          <Badge variant="secondary" className="text-[10px]">
            {(t.totalSeconds / 3600).toFixed(1)}h · {t.totalFrames}f
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => markPublished(t.id)}
          >
            <Check className="size-3.5" /> Mark published
          </Button>
        </li>
      ))}
      {remaining > 0 && (
        <li className="px-1 text-xs text-muted-foreground">
          +{remaining} more not shown
        </li>
      )}
    </ul>
  );
}
