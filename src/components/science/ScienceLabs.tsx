"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BellOff, Earth, Loader2, Rocket } from "lucide-react";
import { EPHEMERIS } from "@/lib/science/ephemeris";
import { FacilityPanel } from "./FacilityPanel";
import { SpacecraftPanel } from "./SpacecraftPanel";
import type { PathFrame, ScienceData, Selection, ViewMode } from "./types";

// WebGL needs window — no SSR for the canvas.
const Scene = dynamic(() => import("./Scene").then((m) => m.Scene), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-[#05070d]">
      <div className="flex items-center gap-2 text-sm text-neutral-400">
        <Loader2 className="size-4 animate-spin" /> Loading Science Labs…
      </div>
    </div>
  ),
});

export function ScienceLabs() {
  const [data, setData] = useState<ScienceData | null>(null);
  const [mode, setMode] = useState<ViewMode>("earth");
  const [selection, setSelection] = useState<Selection>(null);
  const [pathView, setPathView] = useState(0);
  const [pathFrame, setPathFrame] = useState<PathFrame>("helio");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/science", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      // keep stale data — dashboard principle: stale > empty
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    pollRef.current = setInterval(refresh, 60_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const markSeen = useCallback(async (facilityId?: string) => {
    setData((d) => {
      if (!d) return d;
      const facilities = d.facilities.map((f) =>
        !facilityId || f.id === facilityId
          ? { ...f, unseen: 0, news: f.news.map((n) => ({ ...n, seen: true })) }
          : f
      );
      const totalUnseen = facilities.reduce((s, f) => s + f.unseen, 0);
      return { ...d, facilities, totalUnseen };
    });
    await fetch("/api/science/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(facilityId ? { facilityId } : {}),
    }).catch(() => {});
  }, []);

  const selectFacility = useCallback(
    (id: string) => {
      setSelection({ type: "facility", id });
      void markSeen(id);
    },
    [markSeen]
  );

  const selectSpacecraft = useCallback((id: string) => {
    setSelection({ type: "spacecraft", id });
  }, []);

  const selectPlanet = useCallback((id: string) => {
    setSelection({ type: "planet", id });
  }, []);

  const selectMoon = useCallback((planet: string, index: number) => {
    setSelection({ type: "moon", planet, index });
  }, []);

  const selectEarth = useCallback(() => {
    setSelection({ type: "earth" });
  }, []);

  // closing a panel just deselects — the camera stays wherever the user left
  // it (still earth-centric when a facility was open). No fly-back animation.
  const deselect = useCallback(() => {
    setSelection(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") deselect();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deselect]);

  const onModeChange = useCallback((m: ViewMode) => setMode(m), []);

  // bump a counter — CameraDirector reframes the whole trajectory on change
  const viewFlightPath = useCallback(() => setPathView((v) => v + 1), []);

  const facilities = data?.facilities ?? [];
  const totalUnseen = data?.totalUnseen ?? 0;

  const selectedFacility =
    selection?.type === "facility"
      ? facilities.find((f) => f.id === selection.id)
      : undefined;
  const selectedCraft =
    selection?.type === "spacecraft" ? EPHEMERIS.spacecraft[selection.id] : undefined;

  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-xl border border-border bg-[#05070d]">
      <Scene
        mode={mode}
        facilities={facilities}
        selection={selection}
        onSelectFacility={selectFacility}
        onSelectSpacecraft={selectSpacecraft}
        onSelectPlanet={selectPlanet}
        onSelectMoon={selectMoon}
        onSelectEarth={selectEarth}
        onModeChange={onModeChange}
        onBackgroundClick={deselect}
        pathView={pathView}
        pathFrame={pathFrame}
      />

      {/* right-edge info sidebar */}
      {selectedFacility && (
        <FacilityPanel facility={selectedFacility} onClose={deselect} />
      )}
      {selection?.type === "spacecraft" && selectedCraft && (
        <SpacecraftPanel
          id={selection.id}
          craft={selectedCraft}
          onClose={deselect}
          onViewPath={viewFlightPath}
          pathFrame={pathFrame}
          onFrameChange={setPathFrame}
        />
      )}

      {/* HUD — top left: title + mode */}
      <div className="absolute left-4 top-4 select-none">
        <div className="text-sm font-semibold tracking-wide text-neutral-100">
          Science Labs
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
          {mode === "earth" ? (
            <>
              <Earth className="size-3" /> Earth — facilities
            </>
          ) : (
            <>
              <Rocket className="size-3" /> Solar system — missions
            </>
          )}
        </div>
      </div>

      {/* HUD — top right: alerts + return */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {mode === "system" && (
          <button
            onClick={selectEarth}
            className="rounded-md border border-white/15 bg-black/50 px-2.5 py-1.5 text-[11px] font-medium text-neutral-200 backdrop-blur hover:bg-black/70"
          >
            ← Return to Earth
          </button>
        )}
        <button
          onClick={() => void markSeen()}
          disabled={totalUnseen === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-black/50 px-2.5 py-1.5 text-[11px] font-medium text-neutral-200 backdrop-blur hover:bg-black/70 disabled:opacity-40"
          title="Mark all facility news as seen"
        >
          <BellOff className="size-3.5" />
          Clear alerts
          {totalUnseen > 0 && (
            <span className="ml-0.5 rounded-full bg-emerald-500/90 px-1.5 py-px text-[10px] font-bold text-black">
              {totalUnseen}
            </span>
          )}
        </button>
      </div>

      {/* HUD — bottom left: legend */}
      <div className="absolute bottom-4 left-4 select-none rounded-md border border-white/10 bg-black/45 px-3 py-2 text-[10px] text-neutral-300 backdrop-blur">
        {mode === "earth" ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-emerald-400" /> facility online
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-red-400" /> offline / unreachable
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block size-2 rounded-full bg-emerald-400 animate-pulse" />
              flashing = unseen news
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block h-px w-4 bg-[#f08080]" /> path traveled
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-px w-4 bg-[#c9ccd4]" /> path ahead
            </div>
            <div className="text-neutral-500">click a craft to trace its flight</div>
          </div>
        )}
      </div>

      {/* HUD — bottom right: controls hint */}
      <div className="absolute bottom-4 right-4 select-none text-[10px] text-neutral-500">
        drag to orbit · scroll to zoom ·{" "}
        {mode === "earth" ? "zoom out for the solar system" : "click Earth to return"}
      </div>
    </div>
  );
}
