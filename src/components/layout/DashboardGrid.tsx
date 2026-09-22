"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  GridLayout,
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { Check, Columns3, Minus, Pencil, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Widget } from "@/components/layout/Widget";
import { Clock } from "@/components/Clock";
import {
  QuickLinks,
  DEFAULT_LINKS,
  type Link,
} from "@/components/QuickLinks";
import { TonightPanel } from "@/components/astro/TonightPanel";
import {
  TargetList,
  type TargetListData,
} from "@/components/astro/TargetList";
import {
  NeedsUpdateList,
  type NeedsUpdateResponse,
} from "@/components/astro/NeedsUpdateList";
import {
  AgendaView,
  type AgendaData,
} from "@/components/calendar/AgendaView";
import { TaskList, type TaskItem } from "@/components/tasks/TaskList";
import { ReportList, type Report } from "@/components/reports/ReportList";
import { SystemMonitor } from "@/components/SystemMonitor";
import {
  FinanceWidget,
  type FinanceWidgetData,
} from "@/components/finance/FinanceWidget";
import {
  CocWidget,
  type CocWidgetData,
} from "@/components/coc/CocWidget";
import { cn } from "@/lib/utils";
import type { TonightConditions } from "@/types";
import type { SysData } from "@/lib/system";

/** Server-rendered snapshots passed to each widget — null means "fetch on mount". */
export interface DashboardData {
  tonight: TonightConditions | null;
  agenda: AgendaData | null;
  tasks: TaskItem[] | null;
  targets: TargetListData | null;
  report: Report[] | null;
  needsUpdate: NeedsUpdateResponse | null;
  system: SysData | null;
  links: Link[] | null;
  finance: FinanceWidgetData | null;
  coc: CocWidgetData | null;
}

import "react-grid-layout/css/styles.css";

const ROW_HEIGHT = 40;
const MARGIN = 16;
const MIN_COLS = 1;
const MAX_COLS = 12;
const DEFAULT_COLS = 6;

/** Lets tile content scroll vertically when the tile is shrunk below content height. */
const SCROLL = "min-h-0 overflow-y-auto";

interface WidgetDef {
  minW: number;
  minH: number;
  render: (data: DashboardData) => ReactNode;
}

const WIDGETS: Record<string, WidgetDef> = {
  now: {
    minW: 1,
    minH: 2,
    render: () => (
      <Widget title="Now" className="h-full" contentClassName={SCROLL}>
        <Clock />
      </Widget>
    ),
  },
  tonight: {
    minW: 2,
    minH: 4,
    render: (d) => (
      <TonightPanel
        className="h-full"
        showMap={false}
        contentClassName={SCROLL}
        initialData={d.tonight}
      />
    ),
  },
  agenda: {
    minW: 1,
    minH: 3,
    render: (d) => (
      <Widget title="Agenda" className="h-full" contentClassName={SCROLL}>
        <AgendaView days={2} initialData={d.agenda} />
      </Widget>
    ),
  },
  tasks: {
    minW: 1,
    minH: 3,
    render: (d) => (
      <Widget title="Tasks" className="h-full" contentClassName={SCROLL}>
        <TaskList
          filter="done=false"
          emptyText="All clear."
          initialTasks={d.tasks}
        />
      </Widget>
    ),
  },
  targets: {
    minW: 2,
    minH: 4,
    render: (d) => (
      <Widget
        title="Top targets tonight"
        className="h-full"
        contentClassName={SCROLL}
      >
        <TargetList limit={5} initialData={d.targets} />
      </Widget>
    ),
  },
  report: {
    minW: 1,
    minH: 3,
    render: (d) => (
      <Widget title="Latest report" className="h-full" contentClassName={SCROLL}>
        <ReportList limit={3} initialReports={d.report} />
      </Widget>
    ),
  },
  needsUpdate: {
    minW: 1,
    minH: 3,
    render: (d) => (
      <Widget
        title="Needs website update"
        className="h-full"
        contentClassName={SCROLL}
      >
        <NeedsUpdateList limit={5} initialData={d.needsUpdate} />
      </Widget>
    ),
  },
  system: {
    minW: 1,
    minH: 3,
    render: (d) => (
      <Widget title="System" className="h-full" contentClassName={SCROLL}>
        <SystemMonitor initialData={d.system} />
      </Widget>
    ),
  },
  links: {
    minW: 1,
    minH: 2,
    render: (d) => (
      <Widget title="Quick links" className="h-full" contentClassName={SCROLL}>
        <QuickLinks links={d.links ?? DEFAULT_LINKS} />
      </Widget>
    ),
  },
  finance: {
    minW: 1,
    minH: 3,
    render: (d) => (
      <Widget title="Finance" className="h-full" contentClassName={SCROLL}>
        <FinanceWidget initialData={d.finance} />
      </Widget>
    ),
  },
  coc: {
    minW: 1,
    minH: 3,
    render: (d) => (
      <Widget title="Clash of Clans" className="h-full" contentClassName={SCROLL}>
        <CocWidget initialData={d.coc} />
      </Widget>
    ),
  },
};

/** Default arrangement at 6 columns — 2 grid units = 1 of the old fixed columns. */
const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "now", x: 0, y: 0, w: 2, h: 4 },
  { i: "tonight", x: 2, y: 0, w: 4, h: 8 },
  { i: "agenda", x: 0, y: 4, w: 2, h: 8 },
  { i: "targets", x: 2, y: 8, w: 2, h: 8 },
  { i: "report", x: 4, y: 8, w: 2, h: 8 },
  { i: "tasks", x: 0, y: 12, w: 2, h: 8 },
  { i: "needsUpdate", x: 2, y: 16, w: 2, h: 8 },
  { i: "system", x: 4, y: 16, w: 2, h: 8 },
  { i: "links", x: 0, y: 20, w: 2, h: 4 },
  { i: "finance", x: 2, y: 24, w: 2, h: 4 },
  { i: "coc", x: 4, y: 24, w: 2, h: 4 },
];

export interface SavedLayout {
  cols: number;
  items: { i: string; x: number; y: number; w: number; h: number }[];
}

/** Saved positions win per widget; anything new/unknown falls back to defaults. */
function mergeLayout(saved: SavedLayout["items"] | null): LayoutItem[] {
  return DEFAULT_LAYOUT.map((def) => {
    const s = saved?.find((it) => it.i === def.i);
    if (!s || !WIDGETS[def.i]) return { ...def };
    return { i: def.i, x: s.x, y: s.y, w: s.w, h: s.h };
  });
}

export function DashboardGrid({
  initial,
  data,
}: {
  initial: SavedLayout | null;
  data: DashboardData;
}) {
  const [cols, setCols] = useState(() =>
    initial && initial.cols >= MIN_COLS && initial.cols <= MAX_COLS
      ? initial.cols
      : DEFAULT_COLS
  );
  const [layout, setLayout] = useState<LayoutItem[]>(() =>
    mergeLayout(initial?.items ?? null)
  );
  const [editing, setEditing] = useState(false);
  // Container width is measured after mount — gate rendering on `mounted`.
  const { width, containerRef, mounted } = useContainerWidth();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gridLayout = useMemo(
    () =>
      layout.map((l) => ({
        ...l,
        minW: WIDGETS[l.i]?.minW ?? 1,
        minH: WIDGETS[l.i]?.minH ?? 1,
      })),
    [layout]
  );

  function persist(nextCols: number, nextLayout: Layout) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cols: nextCols,
          items: nextLayout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })),
        }),
      }).catch(() => {});
    }, 600);
  }

  function changeCols(next: number) {
    const c = Math.max(MIN_COLS, Math.min(MAX_COLS, next));
    setCols(c);
    setLayout((prev) => {
      const fitted = prev.map((l) => {
        const w = Math.min(l.w, c);
        return { ...l, w, x: Math.min(l.x, c - w) };
      });
      persist(c, fitted);
      return fitted;
    });
  }

  function reset() {
    const fresh = DEFAULT_LAYOUT.map((l) => ({ ...l }));
    setCols(DEFAULT_COLS);
    setLayout(fresh);
    persist(DEFAULT_COLS, fresh);
  }

  return (
    <div>
      <div className="mb-3 flex h-8 items-center justify-end gap-2">
        {editing ? (
          <>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Columns3 className="size-3.5" />
              <Button
                size="icon"
                variant="outline"
                className="size-7"
                onClick={() => changeCols(cols - 1)}
                disabled={cols <= MIN_COLS}
                aria-label="Fewer columns"
              >
                <Minus />
              </Button>
              <span className="w-5 text-center tabular-nums">{cols}</span>
              <Button
                size="icon"
                variant="outline"
                className="size-7"
                onClick={() => changeCols(cols + 1)}
                disabled={cols >= MAX_COLS}
                aria-label="More columns"
              >
                <Plus />
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw /> Reset
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              <Check /> Done
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setEditing(true)}
          >
            <Pencil /> Customize
          </Button>
        )}
      </div>

      <div ref={containerRef}>
        {mounted && (
          <GridLayout
            className="layout"
            width={width}
            layout={gridLayout}
            gridConfig={{
              cols,
              rowHeight: ROW_HEIGHT,
              margin: [MARGIN, MARGIN],
            }}
            dragConfig={{
              enabled: editing,
              cancel: "input,textarea,select,a,button",
            }}
            resizeConfig={{ enabled: editing }}
            onLayoutChange={(l) => {
              setLayout([...l]);
              persist(cols, l);
            }}
          >
            {gridLayout.map((l) => (
              <div key={l.i} className={cn(editing && "tile-editing")}>
                {WIDGETS[l.i].render(data)}
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}
