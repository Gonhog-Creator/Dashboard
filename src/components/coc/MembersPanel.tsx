"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Widget } from "@/components/layout/Widget";
import { StatIcon } from "./icons";
import { MemberDetail } from "./MemberDetail";

interface MemberRow {
  tag: string;
  name: string;
  role: string | null;
  warPreference: string | null;
  townHall: number;
  isMe: boolean;
  clanRank: number | null;
  previousClanRank: number | null;
  liveDonations: number;
  liveDonationsReceived: number;
  trophies: number | null;
  league: string | null;
  donations: number | null;
  donationsReceived: number | null;
  capitalContributions: number | null;
  expLevel: number | null;
  warStars: number | null;
  legendTrophies: number | null;
  delta30d: {
    trophies: number;
    donations: number;
    warStars: number;
    expLevel: number;
  } | null;
  /** Actual baseline window in days (<=30 — shorter until history grows). */
  deltaDays: number | null;
  lastSnapshotAt: string | null;
}

type SortKey =
  | "townHall"
  | "trophies"
  | "donations"
  | "capitalContributions"
  | "expLevel"
  | "warStars";

function Delta({ v }: { v: number | undefined }) {
  if (v == null || v === 0) return <span className="text-muted-foreground">—</span>;
  const up = v > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 tabular-nums ${
        up ? "text-green-400" : "text-red-400"
      }`}
    >
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(v).toLocaleString()}
    </span>
  );
}

export function MembersPanel({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [sort, setSort] = useState<SortKey>("townHall");

  // Open member lives in ?member= — refresh and back/forward restore the modal.
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const selected =
    !tabParam || tabParam === "members" ? params.get("member") : null;

  function setSelected(tag: string | null) {
    const q = new URLSearchParams(params.toString());
    if (tag) {
      q.set("member", tag);
      q.set("tab", "members");
    } else {
      q.delete("member");
    }
    router.replace(`${pathname}?${q}`, { scroll: false });
  }

  useEffect(() => {
    fetch("/api/coc/members")
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, [refreshKey]);

  const sorted = useMemo(() => {
    if (!rows) return null;
    return [...rows].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1));
  }, [rows, sort]);

  if (!sorted) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!sorted.length)
    return (
      <p className="text-sm text-muted-foreground">
        No members yet — configure the clan tag and hit Sync.
      </p>
    );

  const thCounts = new Map<number, number>();
  for (const r of sorted) thCounts.set(r.townHall, (thCounts.get(r.townHall) ?? 0) + 1);

  const selectedRow = sorted.find((r) => r.tag === selected);
  // Delta window varies per member — label the column with the max.
  const deltaDays = Math.max(
    0,
    ...sorted.map((r) => r.deltaDays ?? 0)
  );

  const header = (key: SortKey, label: string, icon?: string) => (
    <th
      className="cursor-pointer px-2 py-1.5 text-right font-medium hover:text-foreground"
      onClick={() => setSort(key)}
    >
      <span className="inline-flex items-center justify-end gap-1">
        {icon && <StatIcon icon={icon} size={12} />}
        {label}
        {sort === key && " ↓"}
      </span>
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      <Widget title="Roster">
        <div className="mb-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {[...thCounts.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([th, n]) => (
              <span key={th} className="rounded border border-border px-1.5 py-0.5">
                TH{th} ×{n}
              </span>
            ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border text-left">
                <th className="px-2 py-1.5 font-medium">Member</th>
                {header("townHall", "TH")}
                {header("trophies", "Trophies", "trophy")}
                {header("donations", "Donations", "donationsOut")}
                {header("capitalContributions", "Capital", "capitalGold")}
                {header("warStars", "War stars", "warStar")}
                {header("expLevel", "Exp", "xp")}
                <th className="px-2 py-1.5 text-right font-medium">
                  Δ{deltaDays}d
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.tag}
                  onClick={() => setSelected(r.tag === selected ? null : r.tag)}
                  className={`cursor-pointer border-b border-border/50 hover:bg-accent/50 ${
                    selected === r.tag ? "bg-accent/40" : ""
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <span className={r.isMe ? "font-semibold text-primary" : ""}>
                      {r.name}
                    </span>
                    {r.role && r.role !== "member" && (
                      <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                        {r.role === "coLeader" ? "co" : r.role === "admin" ? "elder" : r.role}
                      </span>
                    )}
                    {r.warPreference === "out" && (
                      <span className="ml-1.5 rounded bg-red-500/15 px-1 py-0.5 text-[9px] font-medium uppercase text-red-400">
                        war out
                      </span>
                    )}
                    {r.clanRank != null && (
                      <span className="ml-1.5 text-[10px] tabular-nums text-muted-foreground">
                        #{r.clanRank}
                        {r.previousClanRank != null &&
                          r.previousClanRank !== r.clanRank && (
                            <span
                              className={
                                r.clanRank < r.previousClanRank
                                  ? "text-green-400"
                                  : "text-red-400"
                              }
                            >
                              {r.clanRank < r.previousClanRank ? "↑" : "↓"}
                              {Math.abs(r.previousClanRank - r.clanRank)}
                            </span>
                          )}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.townHall}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.trophies?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {(r.liveDonations || r.donations)?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.capitalContributions?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.warStars?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r.expLevel ?? "—"}
                    {r.delta30d && r.delta30d.expLevel > 0 && (
                      <span className="ml-1 text-[10px] text-green-400">
                        +{r.delta30d.expLevel}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Delta v={r.delta30d?.trophies} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Δ{deltaDays}d = trophy change vs the snapshot ~{deltaDays} days ago
          {deltaDays < 30
            ? " (full 30-day window once tracking has that much history)"
            : ""}
          . Click a row for the full profile.
        </p>
      </Widget>

      <MemberDetail
        tag={selected}
        isMe={selectedRow?.isMe ?? false}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
