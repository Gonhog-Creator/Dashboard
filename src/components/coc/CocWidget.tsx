"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Swords, Trophy } from "lucide-react";

export interface CocWidgetData {
  configured: boolean;
  clanName: string | null;
  war: {
    state: string;
    opponent: string | null;
    clanStars: number;
    opponentStars: number;
    attacksUsed: number;
    attacksTotal: number;
    endTime: string | null;
  } | null;
  me: {
    trophies: number;
    legendTrophies: number | null;
    league: string | null;
  } | null;
  lastPollAt: string | null;
}

export function CocWidget({ initialData }: { initialData: CocWidgetData | null }) {
  const [data, setData] = useState(initialData);

  useEffect(() => {
    if (data) return;
    fetch("/api/coc/overview")
      .then((r) => r.json())
      .then((o) =>
        setData({
          configured: o.configured,
          clanName: o.clan?.name ?? null,
          war: o.war,
          me: o.me,
          lastPollAt: o.lastPollAt,
        })
      )
      .catch(() => {});
  }, [data]);

  if (!data || !data.configured) {
    return (
      <Link
        href="/coc"
        className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <Swords className="size-5" />
        <span className="text-xs">Set up Clash →</span>
      </Link>
    );
  }

  const { war, me } = data;
  const winning =
    war &&
    (war.clanStars > war.opponentStars ||
      (war.clanStars === war.opponentStars &&
        war.attacksUsed >= war.attacksTotal));

  return (
    <Link href="/coc" className="block h-full">
      <div className="flex h-full flex-col justify-between gap-1">
        <div>
          <p className="text-xs text-muted-foreground truncate">
            {data.clanName ?? "Clan"}
          </p>
          {war ? (
            <div className="mt-0.5">
              <p className="text-lg font-semibold tabular-nums leading-tight">
                <span className={winning ? "text-green-400" : ""}>
                  {war.clanStars}★
                </span>
                <span className="text-muted-foreground"> – </span>
                {war.opponentStars}★
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {war.state === "inWar" ? "Battle day" : war.state} vs{" "}
                {war.opponent ?? "?"} · {war.attacksUsed}/{war.attacksTotal} atk
              </p>
            </div>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">No active war</p>
          )}
        </div>
        {me && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Trophy className="size-3" />
            {me.trophies.toLocaleString()}
            {me.legendTrophies != null && (
              <span className="text-purple-400">
                · {me.legendTrophies.toLocaleString()} LT
              </span>
            )}
          </p>
        )}
      </div>
    </Link>
  );
}
