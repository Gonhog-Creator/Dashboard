# Dashboard Research — Professional Dashboard Resources

Research compiled for the Personal Command Center Dashboard (Next.js 16 / React 19 / Tailwind 4 / shadcn/ui / Prisma+SQLite). Organized by: component libraries & plugins, design/style resources, widget/feature ideas people actually use, and agent tooling (skills/MCP).

---

## 1. Component Libraries & Plugins (fits our stack)

### shadcn/ui ecosystem (primary)
- **shadcn/ui blocks** — official registry has dashboard blocks (`dashboard-01` etc.): sidebar shells, chart sections, data tables, login pages. Install via `npx shadcn@latest add <block>`.
- **shadcn MCP server** — `npx shadcn@latest mcp` exposes registry search/view/install tools to AI editors. Lets me install components correctly with full dependency resolution instead of hand-writing them. **Set this up when we scaffold.**
- **Community registries** — index at `https://ui.shadcn.com/r/registries.json`. Notable: `shadcndashboard.dev` (dashboard kit w/ blocks installable via `npx shadcn add @shadcn-dashboard/[name]`), Magic UI (animated components), Aceternity UI (visual flair), marmelab shadcn-admin-kit.
- **shadcn-registry-mcp** (3rd party) — alternative MCP with `add_component` dryRun, group installs (`form`, `layout`, `data`, `feedback`), custom-registry support.

### Charts (pick one primary)
- **Recharts** — the default for shadcn projects; shadcn chart components are built on it. SVG, SSR-friendly, great DX. Jank past ~1k points — fine for our widgets (weather trends, exposure history).
- **Tremor** (`@tremor/react`) — dashboard-specific React+Tailwind lib: KPI cards, trackers, sparklines, charts wrapping Recharts. Polished out of the box; good for metric widgets fast. Copy-paste model like shadcn.
- **Apache ECharts** — only if we need huge datasets or exotic types (sky charts, heatmaps). Canvas/WebGL, tree-shakeable.
- **visx** — D3 primitives for fully custom viz (e.g., a custom altitude-over-time sky chart for astro targets — actually a strong candidate for that one widget).
- Avoid: Nivo (RSC incompat issues), react-plotly (heavy).

### Grid / layout
- **react-grid-layout** — the standard draggable+resizable widget grid. Serializable layout objects → persist per-user layouts in SQLite `Setting` table. Caveats: needs client-only render or `useContainerWidth` (SSR width detection), watch re-render storms. v2 supports React 18+.
- **gridstack.js** — framework-agnostic alternative, more active core dev, ships React wrapper now. Worth it if RGL feels stale.
- **dnd-kit + CSS grid** — lighter option if we only need sortable sections, not free-form resize.

### Command palette / power-user
- **cmdk** (shadcn `Command` component wraps it) — ⌘K palette like Linear/Raycast. Great fit: "jump to target", "add task", "run job", "toggle theme". Near-zero cost since shadcn ships it.
- **kbar** — alternative with nested actions, shortcuts-as-data, history. Heavier; cmdk is enough.

### Data fetching / state
- **TanStack Query** — standard for widget polling/caching (weather refresh, job status). Pairs well with SSR prefetch.
- **Zustand** — light client state (layout edit mode, widget visibility).
- **nuqs** — URL query state for filters (nice for shareable dashboard views).

### Tables / forms / misc
- **TanStack Table** — the shadcn `DataTable` uses it; for FITS library, job runs, task lists.
- **react-hook-form + zod** — settings forms, task forms (shadcn `Form` wraps this).
- **date-fns / Temporal** — date math for calendar merge.
- **Lucide** — icons (already the shadcn default). For app/service icons later: **dashboardicons.com / selfh.st icons** (10k+ self-hosted app icons, what Homarr uses).
- **sonner** — toast notifications (shadcn default).
- **Framer Motion / motion** — widget transitions, layout animations.

---

## 2. Professional Look — Style & Design Resources

### Theme tooling
- **tweakcn.com** — visual shadcn/Tailwind 4 theme editor. Real-time preview, OKLCH, exports CSS vars straight into globals.css. Has AI theme gen + 43+ presets. **Fastest path to a non-generic look.**
- **tweakcn theme-picker** — one-command installable theme switcher (43 themes, light+dark) if we want runtime theme switching.
- **ui.shadcn.com/themes** — official presets; **shadcn.io / allshadcn.com** — aggregated templates.

### Design inspiration (study these)
- **Mobbin** — 2,100+ real dashboard screens; their "what good dashboard design looks like" study is the best single read. Key takeaways: dashboards that *interpret* data beat ones that display it (Oura score, annotated charts, AI summaries inline).
- **Linear, Vercel, Grafana, Stripe** — reference points for dark-mode dashboards done right.
- **Dribbble/Behance "dashboard"** — visual ideas only; often impractical but good for hero-widget aesthetics.
- **SaaS Landing Page / Pageflows** — real product flows.

### Design principles worth applying (from Mobbin study + SaaS guides)
- **Interpret, don't just display** — a single "tonight: GOOD for imaging" verdict beats 6 raw metrics. Our astro panel should compute a go/no-go score.
- **Hierarchy**: 3–6 metric cards top → primary charts middle → detail tables bottom. F-pattern scanning.
- **Dark mode done right**: true greys not pure black, elevation via background lightness steps (not shadows), ONE saturated accent, dark-tuned chart palette, slightly lighter font weights on dark.
- **Data-ink ratio** — no chartjunk, subtle gridlines, no 3D, color only for meaning.
- **Stale data > empty widget** — show last reading with age in amber rather than blanking (mirador pattern).
- **Glanceable, not watched** — nothing blinks/shimmers; the dashboard is a homepage you see 50x/day.

---

## 3. Widgets & Features People Actually Use

Surveyed: Homepage, Homarr, Dashy, mirador, glimpse, glint, centro, startpage articles.

### The proven core (every successful personal dashboard has these)
- **Links/quick-launch** — fixed-position shortcuts; muscle memory is the payoff. Top-left placement.
- **Tasks** — a REAL task list (due dates, priorities, projects), not a checklist. Most-used widget per mirador's author.
- **Calendar agenda** — merged multi-source "today + next few days".
- **Weather** — current + hourly forecast. Open-Meteo (key-less) is what everyone uses — already in our plan.
- **Clock/date anchor** — trivial but anchors the page.

### High-value additions (from community favorites)
- **AI daily briefing** — glimpse's killer widget: summarizes next 2 days of calendar + unread email + headlines. Maps directly to our Phase 2 "morning briefing" job.
- **System health** — CPU/RAM/uptime/disk mini-charts (Phase 3 in our plan).
- **RSS/news digest** — user-chosen feeds, optionally AI-summarized.
- **Server/service status** — HTTP health checks with response time on hover (Dashy pattern). For us: Photo-AI, Immich, PersonalWebsite uptime.
- **Docker/integration status** — Homarr-style live data from services (Immich is already in our ecosystem).
- **GitHub notifications/PRs** — useful given the auto-publish agent plan.
- **Stocks/crypto ticker** — Yahoo Finance endpoint, no key needed.
- **Notes/sticky** — quick capture.
- **Pomodoro/focus timer** — small but loved.
- **Iframe/custom HTML widget** — escape hatch for anything not built yet.

### UX patterns worth stealing
- **Drag-drop grid with persisted layout** (Homarr/react-grid-layout) — expected table stakes for "professional".
- **Focus zoom** (glint) — enlarge one widget over dimmed backdrop; cramped cell → full view.
- **Dim unfocused panels** — one thing at full brightness.
- **⌘K everything** — navigation + actions + task creation.
- **Multiple dashboard pages/tabs** — e.g., "Today", "Astro", "System".
- **Edit mode toggle** — locked grid by default, drag handles only in edit mode.
- **Per-widget settings** — auto-rendered from zod schemas (centro pattern).

---

## 4. Agent Skills & MCP Tooling (for me to use while building)

### Installable agent skills (SKILL.md format — work with Claude Code/Cursor/etc.)
- **`anthropics/skills`** — official repo; `/plugin marketplace add anthropics/skills`. Includes frontend-design skill (42k stars) — commits to a real aesthetic direction instead of generic AI slop.
- **`hueyexe/frontend-agent-skills`** — 9 skills: ui-visual-composition, design-systems-architecture, interaction-patterns, accessibility, ux-writing, etc. `npx skills@latest add hueyexe/frontend-agent-skills`
- **`dev-AshishRanjan/Frontend-Agency`** — 12 agency-grade skills w/ review gates: creative-direction, visual-language, motion-design, accessibility-review, visual-qa, design-review. `npx frontend-agency install`
- **`kumbajirajkumar123/frontend-design`** — aesthetic directions, typography, color theory skill.
- **skills.sh** — registry/discovery site for the skills format.

### MCP servers relevant to this project
- **shadcn MCP** (`npx shadcn@latest mcp`) — component search/install. Top priority.
- **Playwright MCP** — screenshot/verify the dashboard visually as we build.
- **Prisma/SQLite MCP** — inspect the DB during dev.
- **GitHub MCP** — for the dsoData.ts "needs update" diff + later auto-publish PRs.
- **Context7 / docs MCP** — up-to-date library docs (Next 16 / Tailwind 4 move fast).

### Registries to configure in components.json
```json
"registries": {
  "@shadcn-dashboard": "https://shadcndashboard.dev/r/{name}.json"
}
```

---

## 5. Decisions (locked 2026-09-14)

- **Layout**: fixed CSS grid for MVP. No react-grid-layout yet — simpler, faster, SSR-safe. Add draggable grid in Phase 2/3 if wanted.
- **Theme**: dark-first. True greys (not pure black), elevation via background lightness steps, one saturated accent. Light mode later. Use tweakcn to generate the palette.
- **Skills installed**: `hueyexe/frontend-agent-skills` → `.agents/skills/` (9 skills: ui-visual-composition, design-systems-frontend-architecture, interaction-patterns-components, accessibility-inclusive-design, ux-usability-foundations, ux-writing-content-design, information-architecture-navigation, forms-inputs-checkout, ux-research-discovery-testing).
- **MCP config**: `.mcp.json` created with `shadcn` (component search/install) + `playwright` (visual verification) servers.

## 6. Widget list (MVP + near-term)

### MVP homepage (fixed grid)
- **Tonight's astro verdict** — single go/no-go imaging score computed from cloud cover + seeing + transparency + moon. THE headline widget (Mobbin "interpret don't display").
- **Tonight's conditions detail** — cloud/seeing/moon phase numbers behind the verdict.
- **Visible targets** — top DSOs tonight sorted by altitude/transit.
- **Today's agenda** — merged Google + Apple calendar.
- **Due tasks** — tasks due today/overdue + quick add.
- **Quick links** — fixed-position shortcuts (Photo-AI, Immich, PersonalWebsite admin, Stellarium, etc.). Muscle-memory payoff, top-left.
- **Clock/date** — anchors the page.
- **Space news daily report** — see §7.

### Near-term additions
- **Service status** — HTTP health checks + response time for Photo-AI, Immich, PersonalWebsite, NAS (Dashy pattern).
- **FITS library summary** — total exposure per target, recent sessions.
- **Needs-update count** — imaged-but-not-published badge.
- **Jobs panel** — last run status + manual trigger.
- **RSS feed** — generic feed widget (also the raw source for space news).
- **GitHub notifications/PRs** — matters once auto-publish agent exists.
- **Notes/quick capture** — sticky note widget.
- **Stocks/crypto** — optional, Yahoo Finance no-key endpoint.

## 7. Space News Daily Report — hookup design

**Status: DEFERRED** — user will figure out the ChatGPT connection later. Design below preserved for when it's picked up; not part of the MVP build.

Two paths, both converge on a `Report` table + a homepage widget. Recommend building both — they're cheap and share everything except the source.

### Path A — dashboard generates it internally (recommended primary)
- `node-cron` job `spaceNewsJob` fires daily ~6:00am server time.
- Fetches space RSS feeds (NASA breaking news, Space.com, SpaceNews, Phys.org space, ESA — all free, no keys).
- Calls OpenAI API (`gpt-4o-mini`-class) with the day's headlines → generates a markdown briefing.
- Stores row in `Report` table: `{ type: 'space-news', content, generatedAt, source: 'internal', model }`.
- Homepage widget renders latest report; stale-age badge if >26h old.
- Needs: `OPENAI_API_KEY` in `.env`. ~$0.001–0.01/day.

### Path B — external ChatGPT automation pushes it (if you already have a ChatGPT scheduled task)
- `POST /api/reports/ingest` endpoint, authed by `REPORT_INGEST_KEY` bearer token (env var).
- Body: `{ type, title, content, generatedAt? }` → stored with `source: 'external'`.
- ChatGPT scheduled tasks can't POST directly — bridge via Zapier/Make/n8n, or an OpenAI GPT Action, or worst case a paste-box in the UI that hits the same endpoint.

### Schema
```prisma
model Report {
  id          String   @id @default(cuid())
  type        String   // 'space-news', 'morning-briefing', etc.
  title       String
  content     String   // markdown
  source      String   // 'internal' | 'external'
  model       String?
  generatedAt DateTime
  createdAt   DateTime @default(now())
}
```

This also becomes the foundation for Phase 2's morning-briefing and agent reports — same table, same widget pattern.

## 8. Build-order recommendations

1. Scaffold + tweakcn dark theme + fixed grid shell.
2. `Report` table + ingest endpoint + space-news job early — it's self-contained and you'll see value day one.
3. Recharts via shadcn chart components for standard widgets; visx for the custom astro altitude/visibility chart.
4. ⌘K palette via shadcn Command — nav, "add task", "trigger job", "jump to target".
5. Stale-data pattern everywhere — last-good data + age badge, never blank.
6. Read `github.com/brainphreak/glimpse` before building the widget system — nearly identical architecture (Next.js + next-auth + widgets + AI briefing + Ollama-later).
