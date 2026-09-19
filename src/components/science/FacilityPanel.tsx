"use client";

import { ExternalLink, MapPin } from "lucide-react";
import type { FacilityState } from "./types";
import { PanelShell } from "./PanelShell";

interface Props {
  facility: FacilityState;
  onClose: () => void;
}

/** "3d ago" for recent items, else a short date */
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) {
    const h = Math.floor(ms / 3600000);
    return h < 1 ? "just now" : `${h}h ago`;
  }
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const fmtCoord = (v: number, pos: string, neg: string) =>
  `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;

/**
 * Facility info sidebar on the right edge of the screen — cover image header,
 * details + news feed below. DOM overlay, not anchored in the 3D scene.
 */
export function FacilityPanel({ facility, onClose }: Props) {
  const statusColor =
    facility.status === "offline" ? "#f87171" : facility.status === "online" ? "#4ade80" : "#a3a3a3";

  return (
    <PanelShell image={facility.image} imageAlt={facility.name} onClose={onClose}>
      <div className="px-5 pt-4 pb-1.5">
        <div className="text-[17px] font-semibold leading-tight text-neutral-100">
          {facility.name}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-neutral-400">
          <MapPin size={12} /> {facility.location}
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-5 pb-3">
        <span
          className="inline-block size-1.5 rounded-full"
          style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
        />
        <span
          className="text-[10px] uppercase tracking-wider"
          style={{ color: statusColor }}
        >
          {facility.status}
        </span>
        <a
          href={facility.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[12px] text-sky-300 hover:text-sky-200"
        >
          Website <ExternalLink size={12} />
        </a>
      </div>

      <div className="px-5 pb-4 text-[13px] leading-relaxed text-neutral-300">
        {facility.blurb}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-white/10 px-5 py-3 text-[12px]">
        <div className="text-neutral-500">Type</div>
        <div className="text-right capitalize text-neutral-200">
          {facility.kind.replace("-", " ")}
        </div>
        <div className="text-neutral-500">Coordinates</div>
        <div className="text-right font-mono text-neutral-200">
          {fmtCoord(facility.lat, "N", "S")} {fmtCoord(facility.lon, "E", "W")}
        </div>
        <div className="text-neutral-500">News feed</div>
        <div className="text-right text-neutral-200">
          {facility.feedUrl ? `${facility.news.length} items` : "status only"}
        </div>
      </div>

      <div className="border-t border-white/10 px-5 py-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
          Latest news
        </div>
        {facility.news.length === 0 ? (
          <div className="text-[12px] italic text-neutral-500">
            No recent items — feed quiet or unavailable.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {facility.news.map((n) => (
              <li key={n.id}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-start gap-2"
                >
                  <span
                    className="mt-1.5 inline-block size-1 shrink-0 rounded-full"
                    style={{ background: n.seen ? "#525252" : "#4ade80" }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] leading-snug text-neutral-200 group-hover:text-sky-300">
                      {n.title}
                    </span>
                    {n.summary && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500 line-clamp-2">
                        {n.summary}
                      </span>
                    )}
                    {n.publishedAt && (
                      <span className="mt-0.5 block text-[10px] text-neutral-500">
                        {relTime(n.publishedAt)}
                      </span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelShell>
  );
}
