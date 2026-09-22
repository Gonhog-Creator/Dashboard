"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { StatIcon } from "./icons";
import { Widget } from "@/components/layout/Widget";

interface Overview {
  configured: boolean;
  clan: {
    tag: string;
    name: string;
    level: number;
    members: number;
    points: number;
    warWins: number;
    warWinStreak: number;
    warLeague: string | null;
    capitalLeague: string | null;
    badge: string | null;
    capitalPoints: number;
    capitalHallLevel: number | null;
    builderBasePoints: number;
    warFrequency: string | null;
    location: string | null;
    description: string | null;
  } | null;
  war: {
    state: string;
    opponent: string | null;
    teamSize: number;
    clanStars: number;
    opponentStars: number;
    clanDestruction: number;
    opponentDestruction: number;
    attacksUsed: number;
    attacksTotal: number;
    attacksLeft: string[];
    endTime: string | null;
    startTime: string | null;
  } | null;
  me: {
    tag: string;
    name: string;
    townHall: number;
    expLevel: number;
    thIcon: string | null;
    trophies: number;
    legendTrophies: number | null;
    league: string | null;
    warStars: number;
    upgrades: {
      name: string;
      icon: string | null;
      toLevel: number;
      finishAt: string;
    }[];
  } | null;
  pulse: {
    mostActive: { name: string; value: number } | null;
    topDonator: { name: string; value: number } | null;
    trophyClimber: { name: string; value: number } | null;
    capitalMvp: { name: string; value: number } | null;
    warMvp: {
      name: string;
      stars: number;
      destruction: number;
      opponent: string | null;
    } | null;
    upgrades: { name: string; value: number; total: number } | null;
  };
  lastPollAt: string | null;
  season: { startTime: string | null; endTime: string | null } | null;
}

/** "2d 4h" / "5h 12m" / "43m" remaining until an ISO timestamp. */
function fmtRemaining(iso: string) {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "done";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function warStateLabel(state: string) {
  switch (state) {
    case "preparation":
      return "Preparation day";
    case "inWar":
      return "Battle day";
    case "warEnded":
      return "War ended";
    default:
      return state;
  }
}

export function OverviewPanel({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/coc/overview")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr("failed to load"));
  }, [refreshKey]);

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!data.configured) {
    return (
      <Widget title="Setup required">
        <p className="text-sm text-muted-foreground">
          Set <code>coc.apiKey</code>, <code>coc.clanTag</code> and{" "}
          <code>coc.playerTag</code> in{" "}
          <Link href="/settings" className="text-primary underline">
            Settings
          </Link>{" "}
          (or <code>COC_API_KEY</code> / <code>COC_CLAN_TAG</code> /{" "}
          <code>COC_PLAYER_TAG</code> env vars). Get a key at{" "}
          <a
            href="https://developer.clashofclans.com"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            developer.clashofclans.com
          </a>{" "}
          — whitelist this PC&apos;s public IP.
        </p>
      </Widget>
    );
  }

  const { clan, war, me, pulse, season } = data;
  const warWinning =
    war &&
    (war.clanStars > war.opponentStars ||
      (war.clanStars === war.opponentStars &&
        war.clanDestruction > war.opponentDestruction));

  const tiles: {
    label: string;
    name: string;
    icon: string;
    value: string;
    sub: string;
  }[] = [];
  if (pulse.mostActive)
    tiles.push({
      label: "Most active · 24h",
      name: pulse.mostActive.name,
      icon: "attack",
      value: `${pulse.mostActive.value}`,
      sub: "attacks won",
    });
  if (pulse.topDonator)
    tiles.push({
      label: "Top donator · 24h",
      name: pulse.topDonator.name,
      icon: "donationsOut",
      value: pulse.topDonator.value.toLocaleString(),
      sub: "donated",
    });
  if (pulse.trophyClimber)
    tiles.push({
      label: "Trophy climber · 24h",
      name: pulse.trophyClimber.name,
      icon: "trophy",
      value: `+${pulse.trophyClimber.value.toLocaleString()}`,
      sub: "trophies",
    });
  if (pulse.warMvp)
    tiles.push({
      label: "War MVP · last war",
      name: pulse.warMvp.name,
      icon: "warStar",
      value: `${pulse.warMvp.stars}★`,
      sub: `${pulse.warMvp.destruction.toFixed(0)}% destr.`,
    });
  if (pulse.capitalMvp)
    tiles.push({
      label: "Capital MVP · last raid",
      name: pulse.capitalMvp.name,
      icon: "capitalGold",
      value: pulse.capitalMvp.value.toLocaleString(),
      sub: "looted",
    });
  if (pulse.upgrades)
    tiles.push({
      label: "Upgrades done · 24h",
      name: pulse.upgrades.name,
      icon: "xp",
      value: `${pulse.upgrades.total}`,
      sub: `top +${pulse.upgrades.value}`,
    });
  if (war && war.state === "inWar" && war.attacksLeft.length > 0)
    tiles.push({
      label: "Attacks left",
      name: `${war.attacksLeft.length} member${war.attacksLeft.length === 1 ? "" : "s"}`,
      icon: "raidAttack",
      value: `${war.attacksTotal - war.attacksUsed}`,
      sub:
        war.attacksLeft.slice(0, 3).join(", ") +
        (war.attacksLeft.length > 3 ? ` +${war.attacksLeft.length - 3}` : ""),
    });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Widget title="Clan">
        {clan ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {clan.badge && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clan.badge} alt="" className="size-10" />
              )}
              <div>
                <p className="font-semibold">{clan.name}</p>
                <p className="text-xs text-muted-foreground">
                  {clan.tag} · Level {clan.level}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <Users className="size-3" /> Members
              </span>
              <span className="tabular-nums">{clan.members}/50</span>
              <span className="text-muted-foreground">Clan points</span>
              <span className="tabular-nums">{clan.points.toLocaleString()}</span>
              <span className="text-muted-foreground">War wins</span>
              <span className="tabular-nums">
                {clan.warWins}
                {clan.warWinStreak > 0 && (
                  <span className="text-green-400"> · {clan.warWinStreak} streak</span>
                )}
              </span>
              <span className="text-muted-foreground">War league</span>
              <span>{clan.warLeague ?? "—"}</span>
              <span className="text-muted-foreground">Capital league</span>
              <span>{clan.capitalLeague ?? "—"}</span>
              <span className="text-muted-foreground flex items-center gap-1">
                <StatIcon icon="capitalGold" size={13} /> Capital
              </span>
              <span className="tabular-nums">
                {clan.capitalPoints.toLocaleString()}
                {clan.capitalHallLevel != null && (
                  <span className="text-muted-foreground">
                    {" "}· CH{clan.capitalHallLevel}
                  </span>
                )}
              </span>
              {clan.warFrequency && (
                <>
                  <span className="text-muted-foreground">War frequency</span>
                  <span className="capitalize">
                    {clan.warFrequency.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                </>
              )}
              {clan.location && (
                <>
                  <span className="text-muted-foreground">Location</span>
                  <span>{clan.location}</span>
                </>
              )}
            </div>
            {season?.endTime && (
              <p className="border-t border-border pt-1.5 text-xs text-muted-foreground">
                Season ends{" "}
                <span className="font-medium text-foreground">
                  {fmtRemaining(season.endTime)}
                </span>{" "}
                · {new Date(season.endTime).toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No clan data yet — hit Sync.</p>
        )}
      </Widget>

      <Widget title="Current war">
        {war ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {warStateLabel(war.state)} · {war.teamSize}v{war.teamSize}
              </span>
              {war.endTime && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  ends {new Date(war.endTime).toLocaleString()}
                </span>
              )}
            </div>
            <p className="text-sm">
              vs <span className="font-medium">{war.opponent ?? "?"}</span>
            </p>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold tabular-nums ${
                  warWinning ? "text-green-400" : "text-red-400"
                }`}
              >
                {war.clanStars}
              </span>
              <span className="text-muted-foreground">
                <StatIcon icon="warStar" size={16} /> —
              </span>
              <span className="text-3xl font-bold tabular-nums">
                {war.opponentStars}
              </span>
              <span className="text-muted-foreground">
                <StatIcon icon="warStar" size={16} />
              </span>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              {war.clanDestruction.toFixed(1)}% vs{" "}
              {war.opponentDestruction.toFixed(1)}% destruction ·{" "}
              {war.attacksUsed}/{war.attacksTotal} attacks used
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not in war.</p>
        )}
      </Widget>

      <Widget title="You">
        {me ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {me.thIcon && <StatIcon icon={me.thIcon} size={34} />}
              <div>
                <p className="font-semibold">{me.name}</p>
                <p className="text-xs text-muted-foreground">
                  {me.tag} · TH{me.townHall}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <StatIcon icon="trophy" size={13} /> Trophies
              </span>
              <span className="tabular-nums">{me.trophies.toLocaleString()}</span>
              {me.legendTrophies != null && (
                <>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <StatIcon icon="legend" size={13} /> Legend trophies
                  </span>
                  <span className="tabular-nums">
                    {me.legendTrophies.toLocaleString()}
                  </span>
                </>
              )}
              <span className="text-muted-foreground flex items-center gap-1">
                <StatIcon icon="legend" size={13} /> League
              </span>
              <span>{me.league ?? "—"}</span>
              <span className="text-muted-foreground flex items-center gap-1">
                <StatIcon icon="warStar" size={13} /> War stars
              </span>
              <span className="tabular-nums">{me.warStars.toLocaleString()}</span>
              <span className="text-muted-foreground flex items-center gap-1">
                <StatIcon icon="xp" size={13} /> Experience
              </span>
              <span className="tabular-nums">{me.expLevel}</span>
            </div>
            {me.upgrades.length > 0 && (
              <div className="mt-1 border-t border-border pt-2">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Upgrading · {me.upgrades.length}
                </p>
                <div className="flex flex-col gap-1">
                  {me.upgrades.slice(0, 5).map((u, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs"
                    >
                      {u.icon && <StatIcon icon={u.icon} size={16} />}
                      <span className="truncate">
                        {u.name}
                        <span className="text-muted-foreground">
                          {" "}→ {u.toLevel}
                        </span>
                      </span>
                      <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                        {fmtRemaining(u.finishAt)}
                      </span>
                    </div>
                  ))}
                  {me.upgrades.length > 5 && (
                    <p className="text-[10px] text-muted-foreground">
                      +{me.upgrades.length - 5} more
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Set <code>coc.playerTag</code> in Settings to track yourself.
          </p>
        )}
      </Widget>

      {tiles.length > 0 && (
        <Widget title="Clan pulse" className="md:col-span-2 xl:col-span-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {tiles.map((t) => (
              <div
                key={t.label}
                className="rounded-md border border-border px-3 py-2"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t.label}
                </p>
                <div className="mt-0.5 flex items-end justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{t.name}</p>
                  <span className="flex shrink-0 items-center gap-1">
                    <StatIcon icon={t.icon} size={16} />
                    <span className="text-lg font-bold leading-none tabular-nums">
                      {t.value}
                    </span>
                  </span>
                </div>
                <p className="truncate text-right text-[10px] text-muted-foreground">
                  {t.sub}
                </p>
              </div>
            ))}
          </div>
        </Widget>
      )}

      {data.lastPollAt && (
        <p className="col-span-full text-xs text-muted-foreground">
          Last poll {new Date(data.lastPollAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
