# World Monitor Tab — Deep Analysis & Implementation Plan

Analysis of two open-source "situation awareness" projects and how to bring their
capabilities into this Dashboard as a new tab (or set of features).

- **God's Eye View (GEV)** — `github.com/bilawalsidhu/gods-eye-view` — MIT
- **World Monitor (WM)** — `github.com/koala73/worldmonitor` — AGPL-3.0

Both repos were cloned and read in full on 2026-09-24 (GEV: `%TEMP%\gods-eye-view`,
WM: `%TEMP%\worldmonitor`). This document is the implementation reference.

---

## TL;DR

| Option | Effort | Value | Verdict |
|---|---|---|---|
| **A. Iframe self-hosted GEV** | Hours | High (whole live globe) | **Do first** |
| **B. Iframe hosted worldmonitor.app** | Hours | High (whole intel dashboard) | **Do first** |
| **C. WM MCP/REST → `/chat` agent tools** | 1–2 days | High (AI briefs, country risk) | **Do second** |
| **D. Port GEV server providers → `/api/*`** | Days per layer | Medium–high | Cherry-pick |
| **E. Self-host WM (Docker stack)** | 1 day + ongoing | Medium | Only if hosted WM is insufficient |
| **F. Native port of either app** | Weeks–months | Low ROI | **Don't** |

Recommended shape: one `/world` tab containing both iframes (GEV globe + WM
dashboard) behind a sub-tab switcher, plus WM MCP wired into `/chat`. Then
cherry-pick GEV's satellite/flight providers to upgrade `/science` and `/astro`.

---

## 1. Project Profiles

### God's Eye View — "live sensor globe"

A spy-satellite simulator where all data is real. Photorealistic 3D globe with
live aircraft, ships, satellites, earthquakes, fires, CCTV cameras, weather,
radio stations, and a voice-controlled AI agent.

- **Size**: ~169k LOC vanilla JS (726 files), ~98MB repo
- **Stack**: CesiumJS + Vite. **No framework** — vanilla DOM UI
- **License**: MIT — copy anything freely
- **Runtime**: Node >= 24.14 (check local `node -v` before self-hosting)
- **Structure**:
  - `server/providers/` — 564KB of Node middleware proxies (26 providers), **zero Cesium deps** — the portable goldmine
  - `src/layers/` — 2.4MB, 134 files import `cesium` — rendering, deeply coupled
  - `src/data/` — 1.2MB, only 16/124 files import cesium — mostly portable logic
  - `src/voice/` — 335KB, OpenAI Realtime session + 29 voice tools
  - `src/ui/` — 764KB vanilla DOM panels/HUD
  - `src/data/local_data/` — bundled datasets (datacenters, dams, submarine cables, natural earth)

**Layers** (22 in `src/app/layers/`): flights, militaryFlights, localAdsb,
aisLiveVessels, satellites, earthquakes, firms (fires), perimeters, cctv,
alprCameras, radio, transit, bikeshare, traffic, directions, weather, wind,
cyclones, rocketLaunches, submarineCables, militaryInstallations,
militaryAwareness, recentImagery.

**Keyless out of the box**: Esri satellite basemap (OSM fallback), OpenSky
anonymous flights, CelesTrak TLEs, USGS quakes, radio-browser, GFS/ECMWF wind,
cyclones, ALPR cameras, transit, OSRM directions, Delaware HLS video.

**Optional keys**: Google Maps (photorealistic 3D tiles — ~1000 free
sessions/mo), Cesium ion (free tier), OpenAI (voice + AI HUD), AISStream
(free — ships), NASA FIRMS (free — fires), TomTom (free 200k tiles/mo —
traffic), OpenSky OAuth, TheSpaceDevs.

### World Monitor — "intelligence aggregation dashboard"

A Palantir-style OSINT workbench: 435+ curated news feeds AI-synthesized into
briefs, 45+ map layers (conflicts, bases, protests, outages, sanctions, cables),
Country Instability Index, finance radar, prediction markets.

- **Size**: ~135MB repo, vanilla TypeScript + Vite
- **Stack**: globe.gl + deck.gl + maplibre-gl frontend; Vercel Edge Functions
  (60+) + Railway relay + Redis/Upstash backend; protobuf API contracts
  (92 protos); Tauri desktop app; Ollama/Groq/OpenRouter for AI
- **License**: **AGPL-3.0** — copyleft. Copying code into this repo makes
  Dashboard AGPL. **Consume via API/iframe; don't vendor code.**
- **Self-host**: `docker compose` with 5 services (app, ais-relay, redis,
  redis-rest, redis-data) + 4 required generated secrets + seed scripts.
  Works keyless for public sources; ~30 optional API keys unlock more feeds.

**Map layers** (from `src/config/map-layer-definitions.ts`): conflicts,
hotspots, bases, nuclear, irradiators, radiationWatch, spaceports, satellites,
cables, pipelines, datacenters, military, ais (ships), tradeRoutes, flights,
protests, ucdpEvents, displacement, climate, weather, outages, cyberThreats,
natural, fires, waterways, economic, minerals, gpsJamming, ciiChoropleth,
resilienceScore, dayNight, sanctions, iranAttacks, webcams, diseaseOutbreaks,
liveTankers, storageFacilities, fuelShortages + finance/tech/happy variant
layers (stockExchanges, centralBanks, startupHubs, techHQs, cloudRegions,
commodityHubs, gulfInvestments, positiveEvents, kindness, renewableInstallations,
miningSites, processingPlants, commodityPorts).

**Data sources** (`docs/data-sources.mdx`): ACLED, UCDP, GDELT, UNHCR/OCHA,
Polymarket, adsb.lol, Wingbits, CelesTrak, gpsjam.org, FRED, ECB, BIS, EIA,
IEA, Cloudflare Radar, USGS, NASA FIRMS/EONET, Open-Meteo, ReliefWeb, IMF
PortWatch, OREF (Israel rocket sirens), Taiwan MND, abuse.ch, CoinGecko,
435+ tiered RSS feeds with propaganda-risk ratings.

**Variants** (one codebase, hostname-switched): world, tech, finance,
commodity, energy, happy.

---

## 2. Integration Options

### Option A — Iframe self-hosted GEV (recommended, hours)

GEV is a standalone Vite app designed to run locally. Run it on the always-on
PC, iframe it into a Dashboard tab.

```bash
# one-time
git clone https://github.com/bilawalsidhu/gods-eye-view C:\gev
cd C:\gev && npm install
# persistent run (pick one)
npm run dev -- --host 127.0.0.1 --port 4173      # dev server
npm run build && npm run preview -- --port 4173  # or built assets
```

Then a thin Next.js page:

```tsx
// src/app/world/page.tsx (sketch — not implemented)
<iframe src="http://127.0.0.1:4173" className="h-full w-full border-0" />
```

Notes:
- Bind to `127.0.0.1` — the iframe loads it client-side, so it must be
  reachable from the *viewing* machine. Over Tailscale, bind to the Tailscale
  interface or `0.0.0.0` on the LAN instead.
- GEV has its own server-side key proxying — no keys needed to start; add
  Google Maps / AISStream / FIRMS / OpenAI keys later via its POWER UP panel
  or `.env`.
- Dashboard's `proxy.ts` auth gate protects the `/world` page itself; the
  iframe content is a separate origin so it's unaffected. If Dashboard sets
  CSP `frame-src`, allow the GEV origin.
- Optionally run GEV as a Windows service / scheduled task (NSSM or
  `pm2-windows-service`) so it survives reboots like the dashboard.

### Option B — Iframe hosted worldmonitor.app (recommended, hours)

WM ships an official embed surface (`embed.html`, `api/embed/map-frame.ts`),
so framing is a supported path. The full dashboard URL the user pasted
(`worldmonitor.app/dashboard?lat=…&layers=…`) already round-trips camera +
layer state through query params — perfect for preset views.

```tsx
<iframe src="https://www.worldmonitor.app/dashboard?lat=39.8&lon=-98.5&zoom=3&layers=conflicts,bases,hotspots,fires,weather"
        className="h-full w-full border-0" />
```

Caveats to verify at build time:
- `frame-ancestors`/`X-Frame-Options` on `worldmonitor.app` — if the full
  dashboard refuses framing, use their documented embed endpoint instead.
- Pro-gated layers show locked UI; the free tier still covers the core map.
- It's their hosted instance — no infra to run, but you're subject to their
  uptime/rate limits.

### Option C — WM MCP server → `/chat` agent tools (high value)

WM exposes a public MCP server at `https://worldmonitor.app/mcp`
(Streamable HTTP). `tools/list` is unauthenticated; `tools/call` needs an
`X-WorldMonitor-Key` (free account gets a daily allowance of cache-backed
tools; Pro unlocks the rest). Self-hosted stacks serve it at `/api/mcp` with
`WORLDMONITOR_VALID_KEYS`.

~35 tools observed in `api/mcp/registry/`:

| Category | Tools |
|---|---|
| Briefs | `get_world_brief`, `get_country_brief`, `get_country_risk`, `get_country_coverage` |
| Analysis | `analyze_situation`, `get_signal_convergence`, `get_focal_points`, `get_alert_digest`, `get_hotspot_escalation`, `get_military_surge`, `simulate_infrastructure_cascade`, `get_population_exposure` |
| Intel history | `search_intel_history`, `get_intel_timeline`, `get_similar_events` |
| Domain | `get_airspace`, `get_maritime_activity`, `get_chokepoint_dependencies`, `get_supply_vulnerabilities`, `get_commodity_geo`, `get_mineral_production`, `get_food_stocks`, `get_resilience_indicators`, `get_demographics_capability` |
| Finance | `get_five_factor_scorecard`, `list_five_factor_scorecards`, `get_consumer_prices`, `get_wto_trade_flows`, `get_procurement_opportunities`, `get_defense_industrial_base`, `get_china_decision_signals` |
| Meta | `get_sources`, `describe_tool`, `generate_forecasts`, `search_flights`, `search_flight_prices_by_date`, `list_x_feed` |

Integration: add an MCP client to the chat agent (Phase 2 already plans an
OpenAI provider interface — MCP tool-calling slots in naturally). This gives
`/chat` queries like "what's the situation in Taiwan" or "any escalation
signals today" backed by real aggregated intel — **zero self-hosting**.

### Option D — Port GEV server providers → Dashboard `/api/*` (cherry-pick)

`server/providers/` are plain Node middleware (connect-style) with **no Cesium
dependency** — they adapt cleanly to Next.js route handlers. Best candidates:

| Provider | What it does | Why port it |
|---|---|---|
| `space/celestrak.js` | TLE fetch + disk cache | Live SGP4 satellites for `/science` (replaces static `ephemeris.json`) |
| `aircraft/opensky.js` | OpenSky proxy + **adaptive credit governor** (stretches cache TTL as daily quota drains, serves stale under 429) | Flights-overhead layer; the governor pattern is reusable for any quota'd API |
| `aircraft/adsb-lol.js` | adsb.lol keyless ADS-B | Free military/flight tracking, no quota |
| `vessels/ais-live.js` | AISStream websocket → snapshot | Ship traffic (free key) |
| `firms.js` + `firePerimeters.js` | NASA FIRMS fires | Wildfire layer/alerts (free key) |
| `wind/` (gfs/ifs/decode) | GRIB2 decode → wind grid | Animated wind on `/science` globe; also useful for astro seeing conditions |
| `cyclones.js` + `weather.js` | NHC/CPHC tracks, observations | Weather layer |
| `cctv/` (catalog/media/stream) | OSM + state DOT camera catalog, HLS proxy w/ SSRF hardening | "Cameras near me" — genuinely unique |
| `radio/` | radio-browser catalog + click-count | Playable local radio on the globe |
| `overpass/` + `military-installations/` | OSM Overpass queries | Infrastructure layers |
| `transit.js` + `gbfs.js` | GTFS-RT + bikeshare | Local transit layer |
| `openai/` (realtime/tools/hud-summary) | Voice session broker + 29 tool defs | Template for `/chat` tool-calling architecture |

Also portable: `src/data/local_data/` bundled JSON — datacenters (4,351),
dams (704), submarine cables (712), natural-earth regions — copy verbatim.

Worth stealing as *patterns* even without the code: dead-reckoning
interpolation between 15–30s feed polls, SGP4 orbit rings with GMST
realignment, screen-space heading projection for icons, serve-stale caching.

### Option E — Self-host WM (only if hosted proves insufficient)

`docker compose up -d` + 4 generated secrets + `./scripts/run-seeders.sh`.
Heavier than GEV (Redis, AIS relay, seeders) and AGPL — but gives you the
full 45-layer dashboard + private MCP at `/api/mcp` with your own keys.
Reasonable on the always-on PC if Docker Desktop is acceptable; otherwise skip.

### Option F — Native port (don't)

GEV: 134 Cesium-coupled layer files + 764KB vanilla DOM UI → rewrite for
R3F/shadcn. WM: protobuf contracts + Vercel edge + Redis + 3.7MB of panel
components → rewrite. Weeks-to-months each for worse results than iframing.

---

## 3. Use Cases (mapped to this Dashboard)

- **Ambient situation-room display** — the primary win. A dedicated `/world`
  tab (or wall-mounted thin client) showing the live globe + intel map.
  Always-on PC + Tailscale clients is exactly the right hardware.

- **Astrophotography planner synergy** (`/astro`):
  - Satellite pass prediction (GEV `satellitePass.js` + CelesTrak TLEs) —
    ISS/bright-sat rise/peak/set over your observing site; satellite trails
    are a real imaging nuisance.
  - Aircraft-overhead density (OpenSky/adsb.lol) — plane trails in long
    exposures; a "traffic overhead now" input to the go/no-go verdict.
  - GFS wind layer — upper-level wind correlates with seeing quality.

- **`/science` upgrade** — replace `ephemeris.json` static positions with
  live SGP4 propagation (`satellite.js` + `celestrak.js` port). Orbit rings,
  real-time positions, pass prediction. The single best code lift.

- **`/chat` agent superpowers** — WM MCP tools give the agent world-brief,
  country-risk, convergence-signal, and market-radar capabilities. GEV's
  `server/providers/openai/tools.js` (29 tool definitions over a live scene)
  is a proven template for scene-aware tool-calling.

- **Deferred space-news report** — WM's `get_world_brief` + tiered RSS
  pipeline covers the "daily AI brief" idea from `dashboard-research.md §7`
  without building the aggregation infra.

- **`/finance` context** — WM finance variant (92 exchanges, central banks,
  commodities, Polymarket odds) complements the personal-finance tab with
  macro context; `get_five_factor_scorecard` via MCP.

- **Local awareness** — earthquakes, fires, CCTV/traffic cameras near you,
  local radio, transit positions, GPS-jamming maps.

- **The fun factor** — cockpit view riding a live flight, NVG/FLIR/CRT shader
  skins, detection-box overlay, military HUD. It's a toy, but a genuinely
  useful one.

---

## 4. Recommended Phased Plan

**Phase 1 — Tabs (hours)**
1. Self-host GEV on the PC (`npm run dev`/preview on a port, service-ize later).
2. New `/world` page: sub-tab switcher — "Globe" (GEV iframe) | "Intel"
   (worldmonitor.app iframe with preset layer URL).
3. Add nav entry + optional dashboard widget linking to it.

**Phase 2 — Agent integration (1–2 days)**
4. Register a free WM account → `wm_` API key → env var.
5. MCP client in `/chat` agent; expose the ~10 most useful tools
   (`get_world_brief`, `get_country_risk`, `get_alert_digest`,
   `get_signal_convergence`, `get_hotspot_escalation`, `get_airspace`,
   `get_maritime_activity`, `search_intel_history`, `get_focal_points`,
   `analyze_situation`).

**Phase 3 — Cherry-picks (days, as wanted)**
6. Port `celestrak.js` + `satellite.js` SGP4 → live satellites on `/science`.
7. Port `opensky.js`/`adsb-lol.js` → flights-overhead widget; feed count
   into astro go/no-go.
8. Port `firms.js`, `cyclones.js`, `wind/` as desired.
9. Copy bundled datasets (datacenters/dams/cables) if a native layer is built.

**Phase 4 — Optional**
10. GEV voice console pattern → `/chat` tool-calling (OpenAI Realtime or
    plain function-calling over the globe scene).
11. Self-host WM only if hosted iframe/MCP proves limiting.

---

## 5. Keys & Costs

| Key | Needed for | Cost |
|---|---|---|
| *(none)* | GEV keyless layers + WM hosted iframe | Free |
| `GOOGLE_MAPS_API_KEY` | GEV photorealistic 3D tiles | ~1000 free sessions/mo, then metered — restrict + budget-alert |
| `CESIUM_ION_TOKEN` | GEV ion terrain/imagery | Free tier |
| `AISSTREAM_API_KEY` | GEV ships | Free |
| `NASA_FIRMS` map key | GEV/WM fires | Free |
| `TOMTOM_API_KEY` | GEV live traffic | Free 200k tiles/mo |
| `OPENAI_API_KEY` | GEV voice + AI HUD | Metered (already have for `/chat`) |
| `wm_` API key | WM MCP `tools/call` | Free tier = limited daily cache-backed calls; Pro for full |
| OpenSky OAuth | Higher flight polling | Free |

---

## 6. Risks & Caveats

- **AGPL (WM)** — do not vendor WM code into this repo. Iframe and MCP/REST
  consumption carry no copyleft obligation.
- **Node version** — GEV requires Node ≥24.14; check the PC's runtime.
- **Iframe reachability** — GEV must bind an interface the viewing client can
  reach (Tailscale IP, not just localhost, for thin clients).
- **CSP/frame-ancestors** — Dashboard CSP may need `frame-src` for the GEV
  origin; WM hosted may restrict framing to their embed surface — verify.
- **Rate limits** — OpenSky anonymous is quota-thin (GEV's governor exists
  for a reason); WM free MCP has daily caps. Both degrade gracefully.
- **Two globes, two stacks** — `/science` stays R3F; GEV stays Cesium. Don't
  try to unify them; the iframe boundary is the feature.
- **Maintenance** — pinned clones drift; update GEV occasionally for feed
  fixes. WM hosted needs no maintenance.

## 7. Reference: where things live in the clones

| What | GEV (`%TEMP%\gods-eye-view`) | WM (`%TEMP%\worldmonitor`) |
|---|---|---|
| Server proxies | `server/providers/` | `api/` + `server/worldmonitor/` |
| Layer registry | `src/app/layers/` | `src/config/map-layer-definitions.ts` |
| Feed catalog | `DATA_SOURCES.md` | `src/config/feeds.ts` + `docs/data-sources.mdx` |
| MCP tools | n/a | `api/mcp/registry/*-tools.ts` |
| Voice/agent tools | `src/voice/` + `server/providers/openai/tools.js` | n/a |
| Bundled datasets | `src/data/local_data/` | `src/config/*.ts` (geo registries) |
| Self-host docs | `README.md` quick start | `SELF_HOSTING.md` + `docker-compose.yml` |
| Runtime docs | `docs/CURRENT-STATE.md` (411KB, authoritative) | `ARCHITECTURE.md` |
