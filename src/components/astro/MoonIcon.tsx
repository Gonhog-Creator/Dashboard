/**
 * Apple-style moon phase icon: a disc with the lit portion computed from the
 * illumination fraction and waxing/waning direction.
 */
export function MoonIcon({
  phase,
  angle,
  size = 28,
  className,
}: {
  phase: number; // 0-1 illumination fraction
  angle: number; // 0-360 phase angle (<180 waxing, >180 waning)
  size?: number;
  className?: string;
}) {
  const r = 10;
  const c = 12;
  const f = Math.min(1, Math.max(0, phase));
  const waxing = angle < 180;
  // Terminator ellipse half-width: r at new/full, 0 at quarters.
  const rx = Math.abs(1 - 2 * f) * r;
  // Lit limb: right side while waxing, left while waning.
  const limbSweep = waxing ? 1 : 0;
  // Terminator bulge: into the dark side for crescents, into lit for gibbous.
  const termSweep = f < 0.5 ? (waxing ? 0 : 1) : waxing ? 1 : 0;

  const d = [
    `M ${c} ${c - r}`,
    `A ${r} ${r} 0 0 ${limbSweep} ${c} ${c + r}`,
    `A ${rx.toFixed(2)} ${r} 0 0 ${termSweep} ${c} ${c - r}`,
    "Z",
  ].join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <circle cx={c} cy={c} r={r} className="fill-muted/40" />
      <path d={d} className="fill-amber-100/90" />
      <circle
        cx={c}
        cy={c}
        r={r - 0.5}
        fill="none"
        className="stroke-foreground/20"
        strokeWidth="1"
      />
    </svg>
  );
}
