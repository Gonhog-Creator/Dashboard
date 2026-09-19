"use client";

const ZOOM = 6;
const TILE = 256;
const LAYER = "MODIS_Terra_Cloud_Fraction_Night";
const MATRIX = "GoogleMapsCompatible_Level6";

function lonToX(lon: number, z: number) {
  return ((lon + 180) / 360) * 2 ** z;
}
function latToY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

/**
 * Night-time cloud cover around the observer — NASA GIBS MODIS Terra cloud
 * fraction, night overpass ~10:30pm local (free, no API key), rendered as a
 * 3x3 tile grid centered on the location. The granule for "today" is last
 * night's pass; before ~noon UTC it may not be processed yet, so we fall
 * back to the previous day.
 */
export function CloudMap({
  lat,
  lon,
  fetchedAt,
  className = "h-44",
}: {
  lat: number;
  lon: number;
  fetchedAt: string;
  className?: string;
}) {
  const fetched = new Date(fetchedAt);
  const d =
    fetched.getUTCHours() < 12
      ? new Date(fetched.getTime() - 86400_000)
      : fetched;
  const date = d.toISOString().slice(0, 10);

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
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: TILE * 3,
          height: TILE * 3,
          // Observer's pixel is the middle tile's center + fractional offset;
          // land it exactly on the container's center.
          transform: `translate(${-TILE * 1.5 - offX}px, ${-TILE * 1.5 - offY}px)`,
        }}
      >
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${LAYER}/default/${date}/${MATRIX}/${ZOOM}/${t.y}/${t.x}.png`}
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
      <div className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-black/60" />
      {/* caption scrim */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-2 pt-8">
        <p className="text-[11px] text-white/70">
          Cloud cover · NASA GIBS MODIS Terra · {date}
        </p>
      </div>
    </div>
  );
}
