"use client";

import { useEffect, useState } from "react";
import { csColor } from "@/lib/coc/clashspot";
import { StatIcon } from "./icons";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface CsDataset {
  label?: string;
  color: string | string[]; // hex, resolved server-side
  values: number[];
}

interface CsChart {
  type: string; // "bar" | "barPercent"
  title: string;
  icon: string | null;
  labels: (string | number)[];
  datasets: CsDataset[];
  images: string[];
  tooltipValues: string[];
  yTitle: string | null;
  stacked: boolean;
}

const CHART_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  fontSize: 12,
};

/** ClashSpot stats sub-tabs — paths map to clashspot.net/en/stats/<path>. */
const GROUPS: {
  id: string;
  label: string;
  subs: { id: string; label: string; path: string }[];
}[] = [
  {
    id: "local",
    label: "Our Stats",
    subs: [{ id: "local", label: "Our Stats", path: "__local__" }],
  },
  {
    id: "players",
    label: "Players",
    subs: [
      { id: "hv", label: "Home Village", path: "players/home-village" },
      { id: "bb", label: "Builder Base", path: "players/builder-base" },
      { id: "heroes", label: "Heroes", path: "players/heroes" },
      { id: "pets", label: "Pets", path: "players/pets" },
      {
        id: "equip",
        label: "Hero Equipment",
        path: "players/hero-equipment",
      },
      {
        id: "legend",
        label: "Legend League",
        path: "players-legend-league",
      },
      { id: "misc", label: "Misc", path: "players/misc" },
    ],
  },
  {
    id: "clans",
    label: "Clans",
    subs: [{ id: "clans", label: "Clans", path: "clans" }],
  },
  {
    id: "capital",
    label: "Clan Capital",
    subs: [
      { id: "general", label: "General", path: "clan-capital" },
      { id: "league", label: "Leagues", path: "clan-capital/league" },
      { id: "districts", label: "Districts", path: "clan-capital/districts" },
    ],
  },
  {
    id: "wars",
    label: "Clan Wars",
    subs: [
      { id: "general", label: "General", path: "clan-wars/general" },
      { id: "attacks", label: "Attacks", path: "clan-wars/attacks" },
      { id: "townhall", label: "Town Hall", path: "clan-wars/townhall" },
    ],
  },
  {
    id: "cwl",
    label: "Clan War Leagues",
    subs: [{ id: "cwl", label: "CWL", path: "clan-war-leagues" }],
  },
];

/** X-axis tick that renders the game's icon image when available. */
function ChartTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value: string | number };
  images?: string[];
  index?: number;
  rotate?: boolean;
}) {
  const { x = 0, y = 0, payload, images, index = 0, rotate } = props;
  const src = images?.[index];
  if (src)
    return (
      <g transform={`translate(${x},${y})`}>
        <image href={src} x={-10} y={4} width={20} height={20} />
      </g>
    );
  const label = String(payload?.value ?? "");
  const text = label.length > 12 ? label.slice(0, 12) + "…" : label;
  return (
    <g transform={`translate(${x},${y})${rotate ? " rotate(-40)" : ""}`}>
      <text
        y={12}
        textAnchor={rotate ? "end" : "middle"}
        fontSize={9}
        fill="var(--muted-foreground)"
      >
        {text}
      </text>
    </g>
  );
}

function ChartCard({ chart }: { chart: CsChart }) {
  const multi = chart.datasets.length > 1;
  const percent = chart.type === "barPercent";
  const rows = chart.labels.map((label, i) => {
    const row: Record<string, number | string> = { label, _i: i };
    const total = chart.datasets.reduce((s, d) => s + (d.values[i] ?? 0), 0);
    chart.datasets.forEach((d, di) => {
      const v = d.values[i] ?? 0;
      row[`d${di}`] = percent && total > 0 ? (v / total) * 100 : v;
    });
    return row;
  });
  const hasImages = chart.images.length > 0;
  const rotate = !hasImages && chart.labels.length > 10;

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {chart.icon && <StatIcon icon={chart.icon} size={20} />}
        {chart.title}
      </p>
      {chart.yTitle && (
        <p className="text-[11px] text-muted-foreground">{chart.yTitle}</p>
      )}
      <div className="mt-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ left: 0, right: 4, top: 4, bottom: 0 }}
          >
            <XAxis
              dataKey="label"
              interval={0}
              height={hasImages ? 30 : rotate ? 52 : 20}
              tick={(p) => (
                <ChartTick
                  {...p}
                  images={chart.images}
                  index={p.index}
                  rotate={rotate}
                />
              )}
            />
            <YAxis
              tick={{ fontSize: 9 }}
              width={44}
              tickFormatter={(v: number) =>
                percent
                  ? `${Math.round(v)}%`
                  : v >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1000
                      ? `${(v / 1000).toFixed(0)}k`
                      : `${v}`
              }
            />
            <Tooltip
              contentStyle={CHART_STYLE}
              labelFormatter={(_, payload) => {
                const i = payload?.[0]?.payload?._i as number | undefined;
                return (
                  chart.tooltipValues[i ?? -1] ??
                  String(payload?.[0]?.payload?.label ?? "")
                );
              }}
              formatter={(v, name) => {
                const di = Number(String(name).slice(1));
                const ds = chart.datasets[di];
                return [
                  percent
                    ? `${Number(v).toFixed(1)}%`
                    : Number(v).toLocaleString(),
                  ds?.label ?? chart.title,
                ];
              }}
            />
            {chart.datasets.map((d, di) => (
              <Bar
                key={di}
                dataKey={`d${di}`}
                stackId={multi || chart.stacked ? "s" : undefined}
                fill={Array.isArray(d.color) ? d.color[0] : d.color}
                radius={multi ? 0 : [3, 3, 0, 0]}
              >
                {!multi &&
                  Array.isArray(d.color) &&
                  d.color.map((c, i) => <Cell key={i} fill={c} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Shape of /api/coc/global we chart from (official API + our war DB). */
interface LocalStats {
  location: { name: string };
  players: {
    name: string;
    trophies: number;
    expLevel: number;
    league?: { name: string } | null;
  }[];
  clans: { name: string; clanPoints?: number; clanLevel: number }[];
  bbPlayers: { builderBaseTrophies: number }[];
  capitals: {
    name: string;
    capitalPoints?: number;
    clanCapitalPoints?: number;
  }[];
  legend: {
    season: string | null;
    players: { name: string; trophies: number; attackWins: number }[];
  };
  warStats: {
    wars: number;
    attacks: number;
    playersTracked: number;
    thDist: { th: number; count: number }[];
    starsDist: { stars: number; count: number }[];
    destructionDist: { bucket: string; count: number }[];
    durationDist: { bucket: string; count: number }[];
    thDiffStars: { thDiff: number; avgStars: number; count: number }[];
    cwl: { starsDist: { stars: number; count: number }[] };
    regular: { starsDist: { stars: number; count: number }[] };
  } | null;
}

const STAR_HEX = ["#f24236", "#f4c200", "#49a078", "#2e86ab"];
const TH_ICON = (th: number) =>
  `https://static.clashspot.net/media/game/townhall/th${th}.png`;

function bar(
  title: string,
  labels: (string | number)[],
  values: number[],
  color: string | string[],
  extra?: Partial<CsChart>
): CsChart {
  return {
    type: "bar",
    title,
    icon: null,
    labels,
    datasets: [{ color, values }],
    images: [],
    tooltipValues: [],
    yTitle: null,
    stacked: false,
    ...extra,
  };
}

/** Build CsChart[] from our own API + tracked-war data (works while ClashSpot rate-limits us). */
function apiToCharts(d: LocalStats): CsChart[] {
  const short = (s: string) => (s.length > 9 ? s.slice(0, 9) + "…" : s);
  const charts: CsChart[] = [];
  const ws = d.warStats;

  if (ws && ws.attacks > 0) {
    charts.push(
      bar(
        `Players by Town Hall · ${ws.playersTracked} tracked`,
        ws.thDist.map((t) => `TH${t.th}`),
        ws.thDist.map((t) => t.count),
        ws.thDist.map((t) => csColor(`th${t.th}`)),
        {
          images: ws.thDist.map((t) => TH_ICON(t.th)),
          tooltipValues: ws.thDist.map((t) => `TH ${t.th}`),
          yTitle: "Players",
        }
      ),
      bar(
        `Attack results · ${ws.attacks} attacks / ${ws.wars} wars`,
        ws.starsDist.map((s) => `${s.stars}★`),
        ws.starsDist.map((s) => s.count),
        STAR_HEX
      ),
      bar(
        "Destruction %",
        ws.destructionDist.map((b) => b.bucket),
        ws.destructionDist.map((b) => b.count),
        "#f24236"
      ),
      bar(
        "Attack duration",
        ws.durationDist.map((b) => b.bucket),
        ws.durationDist.map((b) => b.count),
        "#49a078"
      ),
      bar(
        "Avg stars by TH difference",
        ws.thDiffStars.map((t) => (t.thDiff > 0 ? `+${t.thDiff}` : `${t.thDiff}`)),
        ws.thDiffStars.map((t) => t.avgStars),
        "#8a3a68"
      )
    );
    if (ws.cwl.starsDist.some((s) => s.count > 0))
      charts.push(
        bar(
          "CWL attack results",
          ws.cwl.starsDist.map((s) => `${s.stars}★`),
          ws.cwl.starsDist.map((s) => s.count),
          STAR_HEX
        )
      );
  }

  const leagueCount = new Map<string, number>();
  for (const p of d.players)
    leagueCount.set(
      p.league?.name ?? "Unranked",
      (leagueCount.get(p.league?.name ?? "Unranked") ?? 0) + 1
    );
  const leagues = [...leagueCount.entries()].sort((a, b) => b[1] - a[1]);

  charts.push(
    bar(
      `Top 20 players · ${d.location.name}`,
      d.players.slice(0, 20).map((p) => short(p.name)),
      d.players.slice(0, 20).map((p) => p.trophies),
      "#f4c200",
      { yTitle: "Trophies" }
    ),
    bar(
      `Players per league · top ${d.players.length}`,
      leagues.map(([l]) => l),
      leagues.map(([, c]) => c),
      "#f4c200"
    ),
    bar(
      `Top 20 clans · ${d.location.name}`,
      d.clans.slice(0, 20).map((c) => short(c.name)),
      d.clans.slice(0, 20).map((c) => c.clanPoints ?? 0),
      "#2e86ab",
      { yTitle: "Clan points" }
    ),
    bar(
      "Top 20 capital clans",
      d.capitals.slice(0, 20).map((c) => short(c.name)),
      d.capitals
        .slice(0, 20)
        .map((c) => c.capitalPoints ?? c.clanCapitalPoints ?? 0),
      "#ff8700",
      { yTitle: "Capital trophies" }
    ),
    bar(
      `Legend league${d.legend.season ? ` · ${d.legend.season}` : ""}`,
      d.legend.players.slice(0, 20).map((p) => short(p.name)),
      d.legend.players.slice(0, 20).map((p) => p.trophies),
      "#8a3a68",
      { yTitle: "Trophies" }
    )
  );
  return charts;
}

export function GlobalPanel({ refreshKey }: { refreshKey: number }) {
  const [group, setGroup] = useState("local");
  const [sub, setSub] = useState("local");
  const [charts, setCharts] = useState<CsChart[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  const g = GROUPS.find((x) => x.id === group) ?? GROUPS[0];
  const subPath =
    g.subs.find((s) => s.id === sub)?.path ?? g.subs[0].path;

  const isLocal = subPath === "__local__";

  useEffect(() => {
    let dead = false;
    setLoading(true);
    setError(null);
    const url = isLocal
      ? "/api/coc/global?location=32000000"
      : `/api/coc/clashspot?path=${encodeURIComponent(subPath)}`;
    fetch(url)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        if (!dead)
          setCharts(isLocal ? apiToCharts(j as LocalStats) : (j.charts ?? []));
      })
      .catch((e) => {
        if (!dead) {
          setCharts(null);
          setError(e instanceof Error ? e.message : "failed");
        }
      })
      .finally(() => {
        if (!dead) setLoading(false);
      });
    return () => {
      dead = true;
    };
  }, [subPath, refreshKey, retry]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Clash of Clans Stats</h2>
        <span className="text-[11px] text-muted-foreground">
          {isLocal ? (
            "official API + tracked wars"
          ) : (
            <>
              data from{" "}
              <a
                href="https://clashspot.net/en/statistics"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                clashspot.net
              </a>
            </>
          )}
        </span>
      </div>

      {/* Group tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {GROUPS.map((gr) => (
          <button
            key={gr.id}
            onClick={() => {
              setGroup(gr.id);
              setSub(gr.subs[0].id);
            }}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              group === gr.id
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            {gr.label}
          </button>
        ))}
      </div>

      {/* Sub-tabs (ClashSpot-style pills) */}
      {g.subs.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {g.subs.map((s) => (
            <button
              key={s.id}
              onClick={() => setSub(s.id)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                sub === s.id
                  ? "border-primary bg-primary/10 font-medium"
                  : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="text-sm text-muted-foreground">
          {isLocal ? "Loading stats…" : "Loading charts from ClashSpot…"}
        </p>
      )}
      {error && !loading && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="text-muted-foreground">
            {isLocal
              ? `Couldn't load stats (${error}).`
              : `Couldn't load from ClashSpot (${error}). They rate-limit aggressively — wait a few minutes and`}{" "}
            <button
              className="underline hover:text-foreground"
              onClick={() => setRetry((r) => r + 1)}
            >
              retry
            </button>
            .
          </p>
        </div>
      )}
      {charts && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {charts.map((c, i) => (
            <ChartCard key={`${subPath}-${i}`} chart={c} />
          ))}
          {charts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No charts on this page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
