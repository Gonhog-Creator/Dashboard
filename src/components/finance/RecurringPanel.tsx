"use client";

import { useEffect, useState } from "react";
import { Repeat, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney, fmtDate } from "@/lib/finance/format";

interface Stream {
  id: string;
  description: string;
  displayName: string | null;
  amount: number | null;
  frequency: string;
  nextExpected: string | null;
  lastSeen: string | null;
  category: { name: string; color: string } | null;
}

export function RecurringPanel({ refreshKey }: { refreshKey: number }) {
  const [streams, setStreams] = useState<Stream[] | null>(null);
  const [running, setRunning] = useState(false);

  function load() {
    fetch("/api/finance/recurring")
      .then((r) => r.json())
      .then((d) => setStreams(d.streams ?? []))
      .catch(() => setStreams([]));
  }

  useEffect(load, [refreshKey]);

  async function redetect() {
    setRunning(true);
    await fetch("/api/finance/recurring", { method: "POST" }).catch(() => {});
    load();
    setRunning(false);
  }

  if (!streams) return <Skeleton className="h-64 w-full" />;

  const monthly = streams
    .filter((s) => s.frequency === "monthly" && s.amount)
    .reduce((s, r) => s + (r.amount ?? 0), 0);
  const yearly = streams
    .filter((s) => s.frequency === "yearly" && s.amount)
    .reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-6 text-sm">
          <span>
            <span className="text-muted-foreground">Monthly recurring: </span>
            <span className="font-semibold tabular-nums">{fmtMoney(monthly)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Yearly: </span>
            <span className="font-semibold tabular-nums">{fmtMoney(yearly)}</span>
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={redetect} disabled={running}>
          <RefreshCw className={running ? "animate-spin" : ""} />
          Re-detect
        </Button>
      </div>

      {streams.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No recurring payments detected yet. Import transactions, then hit Re-detect.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {streams.map((s) => (
            <Card key={s.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Repeat className="size-3.5 text-primary" />
                  <span className="truncate">{s.displayName ?? s.description}</span>
                </CardTitle>
                <Badge variant="outline" className="text-[10px]">{s.frequency}</Badge>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="tabular-nums font-semibold">
                  {s.amount != null ? fmtMoney(s.amount) : "varies"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Next: {fmtDate(s.nextExpected)} · Last: {fmtDate(s.lastSeen)}
                </p>
                {s.category && (
                  <Badge
                    variant="outline"
                    style={{ borderColor: s.category.color, color: s.category.color }}
                    className="text-[10px]"
                  >
                    {s.category.name}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
