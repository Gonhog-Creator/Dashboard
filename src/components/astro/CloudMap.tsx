"use client";

import { useEffect, useState } from "react";

const ZOOM = 4;
const TILE = 256;

interface RainViewerResponse {
  satellite?: { infrared?: { time: number; path: string }[] };
  radar?: { past?: { time: number; path: string }[] };
}

function lonToX(lon: number, z: number) {
  return ((lon + 180) / 360) * 2 ** z;
}
function latToY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

/**
 * Current cloud cover around the observer — RainViewer infrared satellite
 * tiles (free, no API key), rendered as a 3x3 grid centered on the location.
 * Renders nothing if the feed is unavailable.
 */
export function CloudMap({ lat, lon }: { lat: number; lon: number }) {
  const [tileBase, setTileBase] = useState<string | null>(null);
  const [stamp, setStamp] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: RainViewerResponse) => {
        if (dead) return;
        const frames = d.satellite?.infrared ?? [];
        const last = frames[frames.length - 1];
        if (!last) return setFailed(true);
        setTileBase(`https://tilecache.rainviewer.com${last.path}/256`);
        setStamp(last.time);
      })
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, []);

  if (failed || !tileBase) return null;

  const n = 2 ** ZOOM;
  const xt = lonToX(lon, ZOOM);
  const yt = latToY(lat, ZOOM);
  const cx = Math.floor(xt);
  const cy = Math.floor(yt);
  // Shift so the observer sits at the center of the middle tile.
  const offX = (xt - cx - 0.5) * TILE;
  const offY = (yt - cy - 0.5) * TILE;

  const tiles: { x: number; y: number; key: string }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      tiles.push({ x, y, key: `${x}-${y}` });
    }
  }

  return (
    <div>
      <div className="relative h-44 overflow-hidden rounded-md border border-border bg-black">
        <div
          className="absolute"
          style={{
            width: TILE * 3,
            height: TILE * 3,
            transform: `translate(${-offX}px, ${-offY}px)`,
          }}
        >
          {tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={t.key}
              src={`${tileBase}/${ZOOM}/${t.x}/${t.y}/0/0_0.png`}
              alt=""
              width={TILE}
              height={TILE}
              className="absolute block"
              style={{ left: (t.x - cx + 1) * TILE, top: (t.y - cy + 1) * TILE }}
              loading="lazy"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          ))}
        </div>
        {/* observer marker */}
        <div className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background" />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        IR satellite · RainViewer
        {stamp
          ? ` · ${new Date(stamp * 1000).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}`
          : ""}
      </p>
    </div>
  );
}
