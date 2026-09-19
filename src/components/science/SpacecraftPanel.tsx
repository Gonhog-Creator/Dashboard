"use client";

import { useMemo } from "react";
import { ExternalLink, Route } from "lucide-react";
import { positionAt, toJD } from "@/lib/science/ephemeris";
import { AU, eclToThree, getEarthPos } from "./coords";
import type { SpacecraftEph } from "@/lib/science/ephemeris";
import { PanelShell } from "./PanelShell";
import IMAGES from "@/lib/science/spacecraft-images.json";
import type { PathFrame } from "./types";

interface Props {
  id: string;
  craft: SpacecraftEph;
  onClose: () => void;
  onViewPath: () => void;
  pathFrame: PathFrame;
  onFrameChange: (frame: PathFrame) => void;
}

/**
 * Spacecraft info sidebar on the right edge of the screen — cover image
 * header, mission stats + blurb below. DOM overlay, not anchored in 3D.
 */
export function SpacecraftPanel({ id, craft, onClose, onViewPath, pathFrame, onFrameChange }: Props) {
  const image = (IMAGES as Record<string, string>)[id];

  const stats = useMemo(() => {
    const jdNow = toJD(new Date());
    const [x, y, z] = positionAt(craft.points, jdNow);
    const p = eclToThree(x, y, z);
    const earth = getEarthPos();
    const jd0 = craft.points[0][0];
    const jd1 = craft.points[craft.points.length - 1][0];

    // speed: finite difference across the sample pair bracketing "now"
    // (ephemeris stores positions only — no velocity vectors)
    let i = craft.points.findIndex((pt) => pt[0] >= jdNow);
    if (i < 1) i = 1;
    if (i > craft.points.length - 1) i = craft.points.length - 1;
    const a = craft.points[i - 1];
    const b = craft.points[i];
    const dDays = b[0] - a[0];
    const dAU = Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]);
    const speedKms = dDays > 0 ? (dAU / dDays) * 1731.46 : 0; // 1 AU/day = 1731.46 km/s

    return {
      distSunAU: p.length() / AU,
      distEarthAU: p.distanceTo(earth) / AU,
      speedKms,
      daysIn: Math.max(0, Math.floor(jdNow - jd0)),
      progress: Math.min(1, Math.max(0, (jdNow - jd0) / (jd1 - jd0))),
      launchYear: new Date((jd0 - 2440587.5) * 86400000).getUTCFullYear(),
      endYear: new Date((jd1 - 2440587.5) * 86400000).getUTCFullYear(),
      ended: jdNow > jd1, // mission over (Cassini, DART)
    };
  }, [craft.points]);

  const { distSunAU, distEarthAU, speedKms, daysIn, progress, launchYear, endYear, ended } =
    stats;

  const fmtDist = (au: number) =>
    au < 0.1 ? `${(au * 149.6).toFixed(1)}M km` : `${au.toFixed(2)} AU`;

  return (
    <PanelShell image={image} imageAlt={craft.name} onClose={onClose}>
      <div className="px-5 pt-4 pb-1.5">
        <div className="text-[17px] font-semibold leading-tight text-neutral-100">
          {craft.name}
        </div>
        <div className="mt-1 text-[12px] text-neutral-400">
          {craft.agency} · {ended ? `${launchYear}–${endYear}` : `since ${launchYear}`}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-5 pb-3 text-[12px]">
        <div className="text-neutral-500">Dist. from Sun</div>
        <div className="text-right font-mono text-neutral-200">{fmtDist(distSunAU)}</div>
        <div className="text-neutral-500">Dist. from Earth</div>
        <div className="text-right font-mono text-neutral-200">{fmtDist(distEarthAU)}</div>
        <div className="text-neutral-500">Speed</div>
        <div className="text-right font-mono text-neutral-200">
          {speedKms.toFixed(1)} km/s
        </div>
        <div className="text-neutral-500">Status</div>
        <div className="text-right text-neutral-200">
          {ended ? "Mission ended" : "Active"}
        </div>
        <div className="text-neutral-500">In flight</div>
        <div className="text-right font-mono text-neutral-200">
          {daysIn.toLocaleString()} days
        </div>
      </div>

      {/* mission timeline */}
      <div className="px-5 pb-4">
        <div className="mb-1 flex justify-between text-[10px] text-neutral-500">
          <span>{launchYear}</span>
          <span>{ended ? "complete" : `${Math.round(progress * 100)}%`}</span>
          <span>{endYear}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-sky-400/80"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div className="px-5 pb-4 text-[13px] leading-relaxed text-neutral-300">
        {craft.blurb}
      </div>

      <div className="px-5 pb-4">
        <div className="mb-1.5 text-[10px] uppercase tracking-widest text-neutral-500">
          Flight path frame
        </div>
        <div className="mb-2 flex overflow-hidden rounded-md border border-white/10">
          {(["helio", "earth"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFrameChange(f)}
              className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                pathFrame === f
                  ? "bg-sky-400/20 text-sky-200"
                  : "text-neutral-400 hover:bg-white/5"
              }`}
            >
              {f === "helio" ? "Sun-centered" : "Earth-centered"}
            </button>
          ))}
        </div>
        <button
          onClick={onViewPath}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-[12px] font-medium text-sky-200 transition-colors hover:bg-sky-400/20"
        >
          <Route className="size-3.5" /> View flight path
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">
          Trajectory: JPL Horizons
        </span>
        <a
          href={craft.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[12px] text-sky-300 hover:text-sky-200"
        >
          Mission page <ExternalLink size={12} />
        </a>
      </div>
    </PanelShell>
  );
}
