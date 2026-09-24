"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Users } from "lucide-react";
import { StatIcon } from "./icons";
import { Widget } from "@/components/layout/Widget";
import { WarDetailDialog, type WarRow } from "./WarsPanel";

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
    bestAttack: {
      name: string;
      vs: string;
      stars: number;
      destruction: number;
    } | null;
    bestDefense: {
      name: string;
      vs: string;
      stars: number;
      destruction: number;
    } | null;
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

interface GamesSeason {
  season: string;
  start: string;
  end: string;
  total: number;
  cappedCount: number;
  members: {
    tag: string;
    name: string;
    inClan: boolean;
    points: number;
    capped: boolean;
    partial: boolean;
  }[];
}

interface ClanGames {
  phase: "active" | "ended" | "upcoming";
  season: GamesSeason | null;
  nextStart: string;
  cap: number;
  history: GamesSeason[];
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
  const [wars, setWars] = useState<WarRow[] | null>(null);
  const [games, setGames] = useState<ClanGames | null>(null);
  const [openWar, setOpenWar] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/coc/overview")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setErr("failed to load"));
    fetch("/api/coc/wars")
      .then((r) => r.json())
      .then(setWars)
      .catch(() => setWars([]));
    fetch("/api/coc/games")
      .then((r) => r.json())
      .then(setGames)
      .catch(() => setGames(null));
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

  // The stored war matching the tile — drives the detail dialog + badges.
  // Match on opponent AND (still open or same end time); only fall back to
  // the newest stored war once this one has ended, otherwise a live war in
  // preparation would open the previous war's details.
  const matchedWar = war
    ? (wars?.find(
        (w) =>
          w.opponentName === war.opponent &&
          (w.state !== "warEnded" ||
            (war.endTime != null && w.endTime === war.endTime))
      ) ??
      (war.state === "warEnded" ? (wars?.[0] ?? null) : null))
    : null;
  const warEnded = war
    ? war.endTime
      ? Date.parse(war.endTime) <= Date.now()
      : war.state === "warEnded"
    : false;
  const warPreparing = !!war && !warEnded && war.state === "preparation";
  const warLive = !!war && !warEnded && war.state === "inWar";
  const warActive = warLive || warPreparing;
  const maxStars = (war?.teamSize ?? 0) * 3;

  // Members with zero attacks — shown on the tile, not just the dialog.
  // Stored-war roster is authoritative; fall back to the live API's
  // attacksLeft names when no member detail was captured. Skipped during
  // preparation — nobody can attack yet, so everyone would show as missing.
  const didntAttack =
    war && war.state !== "preparation"
      ? matchedWar && matchedWar.members.length > 0
        ? matchedWar.members
            .filter(
              (m) => !matchedWar.attacks.some((a) => a.attackerTag === m.tag)
            )
            .map((m) => m.name)
        : (war?.attacksLeft ?? [])
      : [];

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
  if (games?.phase === "active" && games.season)
    tiles.push({
      label: "Clan games · live",
      name: `${games.season.cappedCount} completed`,
      icon: "gems",
      value: games.season.total.toLocaleString(),
      sub: "clan points",
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

      <div
        role={matchedWar ? "button" : undefined}
        tabIndex={matchedWar ? 0 : undefined}
        onClick={() => matchedWar && setOpenWar(matchedWar.id)}
        onKeyDown={(e) => {
          if (
            (e.key === "Enter" || e.key === " ") &&
            matchedWar
          ) {
            e.preventDefault();
            setOpenWar(matchedWar.id);
          }
        }}
        className={matchedWar ? "cursor-pointer outline-none" : undefined}
        title={matchedWar ? "Open war details" : undefined}
      >
      <Widget
        title={warActive ? "Current war" : "Latest war"}
        className={
          warLive
            ? "h-full border-green-500/60 shadow-[0_0_12px_-4px_var(--color-green-500)] transition-colors hover:border-primary/50"
            : warPreparing
              ? "h-full border-amber-500/60 shadow-[0_0_12px_-4px_var(--color-amber-500)] transition-colors hover:border-primary/50"
              : war
                ? "h-full transition-colors hover:border-primary/50"
                : undefined
        }
        action={
          war ? (
            warLive ? (
              <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-green-400">
                Live
              </span>
            ) : warPreparing ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
                Preparation
              </span>
            ) : (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                Ended
              </span>
            )
          ) : undefined
        }
      >
        {war ? (
          <div className="flex flex-col gap-2">
            {/* CoC-style matchup: badge — bar — score — bar — badge */}
            <div className="flex items-center justify-center gap-2">
              {matchedWar?.clanBadge && (
                <StatIcon icon={matchedWar.clanBadge} size={30} />
              )}
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="ml-auto h-full rounded-full bg-blue-500 transition-all"
                  style={{
                    width: `${maxStars > 0 ? Math.min(100, (war.clanStars / maxStars) * 100) : 0}%`,
                  }}
                />
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xl font-bold tabular-nums">
                {war.clanStars}
                <StatIcon icon="warStar" size={14} />
                <span className="text-muted-foreground">–</span>
                {war.opponentStars}
                <StatIcon icon="warStar" size={14} />
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-red-500 transition-all"
                  style={{
                    width: `${maxStars > 0 ? Math.min(100, (war.opponentStars / maxStars) * 100) : 0}%`,
                  }}
                />
              </div>
              {matchedWar?.opponentBadge && (
                <StatIcon icon={matchedWar.opponentBadge} size={30} />
              )}
            </div>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium">
                {clan?.name ?? "Us"}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {maxStars > 0 && `of ${maxStars}★`}
              </span>
              <span className="truncate font-medium">
                {war.opponent ?? "?"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span
                className={
                  warPreparing
                    ? "text-sm font-semibold text-amber-400"
                    : undefined
                }
              >
                {warStateLabel(war.state)} · {war.teamSize}v{war.teamSize}
              </span>
              {warPreparing && war.startTime ? (
                <span className="tabular-nums">
                  battle starts{" "}
                  {new Date(war.startTime).toLocaleString()}
                </span>
              ) : war.endTime ? (
                <span className="tabular-nums">
                  {warEnded ? "ended" : "ends"}{" "}
                  {new Date(war.endTime).toLocaleString()}
                </span>
              ) : null}
            </div>
            {warPreparing && war.startTime && (
              <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-center text-sm font-semibold text-amber-400">
                Preparation day — battle begins in{" "}
                {fmtRemaining(war.startTime)}
              </p>
            )}
            <p className="text-xs text-muted-foreground tabular-nums">
              {war.clanDestruction.toFixed(1)}% vs{" "}
              {war.opponentDestruction.toFixed(1)}% destruction ·{" "}
              {war.attacksUsed}/{war.attacksTotal} attacks
              {warLive && war.attacksTotal - war.attacksUsed > 0 && (
                <span className="text-amber-400">
                  {" "}· {war.attacksTotal - war.attacksUsed} left
                </span>
              )}
            </p>
            {(war.bestAttack || war.bestDefense) && (
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-xs">
                {war.bestAttack && (
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Best attack
                    </p>
                    <p className="truncate font-medium">
                      {war.bestAttack.name}
                      <span className="ml-1 tabular-nums text-yellow-400">
                        {war.bestAttack.stars}★
                      </span>
                      <span className="ml-1 tabular-nums text-muted-foreground">
                        {war.bestAttack.destruction.toFixed(0)}%
                      </span>
                    </p>
                    <p className="truncate text-muted-foreground">
                      → {war.bestAttack.vs}
                    </p>
                  </div>
                )}
                {war.bestDefense && (
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Best defense
                    </p>
                    <p className="truncate font-medium">
                      {war.bestDefense.name}
                      <span className="ml-1 tabular-nums text-muted-foreground">
                        held
                      </span>
                      <span className="ml-1 tabular-nums text-yellow-400">
                        {war.bestDefense.stars}★
                      </span>
                      <span className="ml-1 tabular-nums text-muted-foreground">
                        {war.bestDefense.destruction.toFixed(0)}%
                      </span>
                    </p>
                    <p className="truncate text-muted-foreground">
                      vs {war.bestDefense.vs}
                    </p>
                  </div>
                )}
              </div>
            )}
            {didntAttack.length > 0 && (
              <p className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400">
                {warEnded ? "Didn\u2019t attack" : "Yet to attack"}:{" "}
                {didntAttack.join(", ")}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not in war.</p>
        )}
      </Widget>
      </div>

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

      {games && (
        <Widget
          title={
            games.season
              ? `Clan games · ${games.season.season}`
              : "Clan games"
          }
          className="md:col-span-2 xl:col-span-3"
          action={
            games.phase === "active" ? (
              <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-green-400">
                Live · ends in {fmtRemaining(games.season!.end)}
              </span>
            ) : games.phase === "ended" ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                Ended
              </span>
            ) : (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                Starts in {fmtRemaining(games.nextStart)}
              </span>
            )
          }
        >
          {games.season ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <span>
                  <span className="text-lg font-bold tabular-nums">
                    {games.season.total.toLocaleString()}
                  </span>
                  <span className="ml-1 text-sm text-muted-foreground">
                    clan points
                  </span>
                </span>
                <span>
                  <span className="text-lg font-bold tabular-nums">
                    {games.season.cappedCount}
                  </span>
                  <span className="ml-1 text-sm text-muted-foreground">
                    of {games.season.members.length} completed (
                    {games.cap.toLocaleString()})
                  </span>
                </span>
                {games.phase === "ended" && (
                  <span className="text-xs text-muted-foreground">
                    next games{" "}
                    {new Date(games.nextStart).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="grid max-h-72 grid-cols-1 gap-x-6 gap-y-1.5 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                {games.season.members.map((m) => (
                  <div key={m.tag} className="flex items-center gap-2 text-xs">
                    <span
                      className={`w-28 truncate ${
                        m.inClan ? "" : "text-muted-foreground line-through"
                      }`}
                      title={m.name}
                    >
                      {m.name}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${
                          m.capped ? "bg-green-500" : "bg-primary"
                        }`}
                        style={{
                          width: `${Math.min(100, (m.points / games.cap) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right tabular-nums">
                      {m.points.toLocaleString()}
                      {m.partial && (
                        <span
                          className="text-muted-foreground"
                          title="Joined mid-games — actual points may be higher"
                        >
                          ~
                        </span>
                      )}
                    </span>
                    {m.capped && (
                      <Check className="size-3.5 shrink-0 text-green-400" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Next games start{" "}
              <span className="font-medium text-foreground">
                {new Date(games.nextStart).toLocaleDateString()}
              </span>{" "}
              ({fmtRemaining(games.nextStart)}). Points appear here once the
              first snapshot during games lands.
            </p>
          )}
          {games.history.length > 0 && (
            <div className="mt-3 border-t border-border pt-2">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                History
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                {games.history.map((h) => (
                  <span key={h.season} className="tabular-nums">
                    {h.season}:{" "}
                    <span className="text-foreground">
                      {h.total.toLocaleString()}
                    </span>{" "}
                    pts · {h.cappedCount} completed
                  </span>
                ))}
              </div>
            </div>
          )}
        </Widget>
      )}

      {data.lastPollAt && (
        <p className="col-span-full text-xs text-muted-foreground">
          Last poll {new Date(data.lastPollAt).toLocaleString()}
        </p>
      )}

      <WarDetailDialog
        war={wars?.find((w) => w.id === openWar) ?? null}
        onClose={() => setOpenWar(null)}
      />
    </div>
  );
}
