"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface GNode extends SimulationNodeDatum {
  id: string;
  name: string;
  company: string | null;
}

interface GEdge extends SimulationLinkDatum<GNode> {
  type: string;
}

interface GraphData {
  nodes: { id: string; name: string; company: string | null; avatarUrl: string | null }[];
  edges: { source: string; target: string; type: string }[];
}

const EDGE_COLORS: Record<string, string> = {
  spouse: "#e8a2a2",
  parent: "#e8a2a2",
  child: "#e8a2a2",
  sibling: "#e8a2a2",
  family: "#e8a2a2",
  manager: "#8fb8e8",
  report: "#8fb8e8",
  colleague: "#8fb8e8",
  friend: "#a2d9a5",
  company: "#555c66",
  other: "#9a9fa8",
};

/** Deterministic pastel-ish color per company for node fill. */
function companyColor(company: string | null): string {
  if (!company) return "#8a919e";
  let h = 0;
  for (let i = 0; i < company.length; i++)
    h = (h * 31 + company.charCodeAt(i)) | 0;
  return `hsl(${((h % 360) + 360) % 360} 45% 62%)`;
}

export function GraphPanel({
  refreshKey,
  onSelect,
}: {
  refreshKey: number;
  onSelect: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<GraphData | null>(null);
  const [companyEdges, setCompanyEdges] = useState(true);
  // Ref, not state — hover changes must not re-render or rebuild the sim.
  const hoverRef = useRef<string | null>(null);

  // View transform (pan/zoom) and sim live in refs — no react state churn.
  const view = useRef({ x: 0, y: 0, k: 1 });
  const simRef = useRef<ReturnType<typeof forceSimulation<GNode>> | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const dragNode = useRef<GNode | null>(null);
  // Saved fx/fy for every node while one is being dragged (all pinned).
  const pinned = useRef<Map<string, { fx: number | null; fy: number | null }> | null>(null);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    setData(null);
    fetch(`/api/people/graph?companyEdges=${companyEdges}`)
      .then((r) => (r.ok ? r.json() : { nodes: [], edges: [] }))
      .then(setData)
      .catch(() => setData({ nodes: [], edges: [] }));
  }, [refreshKey, companyEdges]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(view.current.x, view.current.y);
    ctx.scale(view.current.k, view.current.k);

    // edges
    for (const e of edgesRef.current) {
      const s = e.source as GNode;
      const t = e.target as GNode;
      if (s.x == null || t.x == null) continue;
      ctx.strokeStyle = EDGE_COLORS[e.type] ?? EDGE_COLORS.other;
      ctx.globalAlpha = e.type === "company" ? 0.35 : 0.7;
      ctx.lineWidth = e.type === "company" ? 1 : 1.5;
      if (e.type === "company") ctx.setLineDash([3, 4]);
      else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y!);
      ctx.lineTo(t.x, t.y!);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // nodes + labels
    const hovered = hoverRef.current;
    for (const n of nodesRef.current) {
      if (n.x == null) continue;
      const r = hovered === n.id ? 9 : 7;
      ctx.beginPath();
      ctx.arc(n.x, n.y!, r, 0, Math.PI * 2);
      ctx.fillStyle = companyColor(n.company);
      ctx.fill();
      if (hovered === n.id) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = hovered === n.id ? "#e8eaee" : "#aab0bb";
      ctx.textAlign = "center";
      ctx.fillText(n.name, n.x, n.y! + r + 13);
    }
  }, []);

  // (Re)build simulation when data arrives.
  useEffect(() => {
    if (!data) return;
    const wrap = wrapRef.current;
    const w = wrap?.clientWidth ?? 800;
    const h = wrap?.clientHeight ?? 600;

    // Carry positions over from the previous sim so a data refresh
    // doesn't make every node jump back to the middle.
    const prev = new Map(nodesRef.current.map((n) => [n.id, n]));
    const nodes: GNode[] = data.nodes.map((n) => {
      const old = prev.get(n.id);
      return old
        ? { ...n, x: old.x, y: old.y, vx: old.vx, vy: old.vy, fx: old.fx, fy: old.fy }
        : { ...n };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges: GEdge[] = data.edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ ...e }));

    nodesRef.current = nodes;
    edgesRef.current = edges;
    // view.current is intentionally preserved — pan/zoom survives refreshes.

    simRef.current?.stop();
    const sim = forceSimulation<GNode>(nodes)
      .force(
        "link",
        forceLink<GNode, GEdge>(edges)
          .id((d) => d.id)
          .distance(90)
      )
      .force("charge", forceManyBody().strength(-220))
      .force("center", forceCenter(w / 2, h / 2))
      .force("collide", forceCollide(26))
      .on("tick", draw);
    // Gentle reheat — settled nodes shouldn't fly apart on rebuild.
    sim.alpha(0.3).restart();
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [data, draw]);

  // Redraw when the container resizes (e.g. detail sheet open/close) —
  // resizing the canvas clears it, and the sim may be asleep.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  function toWorld(e: React.MouseEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - view.current.x) / view.current.k,
      y: (e.clientY - rect.top - view.current.y) / view.current.k,
    };
  }

  function nodeAt(x: number, y: number): GNode | null {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (n.x == null) continue;
      const dx = n.x - x;
      const dy = n.y! - y;
      if (dx * dx + dy * dy < 100) return n;
    }
    return null;
  }

  function onMouseDown(e: React.MouseEvent) {
    const p = toWorld(e);
    const n = nodeAt(p.x, p.y);
    moved.current = false;
    if (n) {
      dragNode.current = n;
      // Pin every node — holding/dragging one must not move the others.
      pinned.current = new Map();
      for (const node of nodesRef.current) {
        pinned.current.set(node.id, { fx: node.fx ?? null, fy: node.fy ?? null });
        node.fx = node.x;
        node.fy = node.y;
      }
      // alphaTarget just above alphaMin (0.001): keeps the timer alive so
      // fx/fy keep applying, but forces are far too weak to move anything.
      simRef.current?.alphaTarget(0.002).restart();
    } else {
      panning.current = { x: e.clientX, y: e.clientY };
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const p = toWorld(e);
    if (dragNode.current) {
      moved.current = true;
      dragNode.current.fx = p.x;
      dragNode.current.fy = p.y;
      return;
    }
    if (panning.current) {
      moved.current = true;
      view.current.x += e.clientX - panning.current.x;
      view.current.y += e.clientY - panning.current.y;
      panning.current = { x: e.clientX, y: e.clientY };
      draw();
      return;
    }
    const n = nodeAt(p.x, p.y);
    const id = n?.id ?? null;
    if (hoverRef.current !== id) {
      hoverRef.current = id;
      draw();
    }
    if (canvasRef.current)
      canvasRef.current.style.cursor = n ? "pointer" : "grab";
  }

  function onMouseUp() {
    if (dragNode.current) {
      if (!moved.current) onSelect(dragNode.current.id);
      // Restore pre-drag fixed positions.
      if (pinned.current) {
        for (const node of nodesRef.current) {
          const p = pinned.current.get(node.id);
          if (p) {
            node.fx = p.fx;
            node.fy = p.fy;
          }
        }
        pinned.current = null;
      }
      dragNode.current = null;
      simRef.current?.alphaTarget(0);
    }
    panning.current = null;
  }

  function onWheel(e: React.WheelEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const k = Math.min(4, Math.max(0.2, view.current.k * factor));
    view.current.x = mx - ((mx - view.current.x) / view.current.k) * k;
    view.current.y = my - ((my - view.current.y) / view.current.k) * k;
    view.current.k = k;
    draw();
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Switch
          id="company-edges"
          checked={companyEdges}
          onCheckedChange={setCompanyEdges}
        />
        <Label htmlFor="company-edges" className="text-xs text-muted-foreground">
          Show shared-company edges
        </Label>
        <span className="ml-auto text-xs text-muted-foreground">
          drag nodes · scroll to zoom · click to open
        </span>
      </div>
      <div
        ref={wrapRef}
        className="h-[calc(100vh-13rem)] min-h-96 w-full overflow-hidden rounded-lg border border-border bg-card"
      >
        {data === null ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading graph…
          </div>
        ) : data.nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No people yet — add some in the Directory tab.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
          />
        )}
      </div>
    </div>
  );
}
