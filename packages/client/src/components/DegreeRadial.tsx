/**
 * DegreeRadial — TASK-098 Increment 3
 *
 * Pure SVG radial progress visualization. No chart library.
 *
 * Two rings:
 *   - Inner ring: overall completion arc (terracotta, strokeDasharray).
 *   - Outer ring: per-bucket spokes — each bucket owns an angular share
 *     proportional to its totalHours / total, filled proportional to its
 *     completion.
 *
 * Arc math (copied from fr4-progress-preview.html):
 *   cx = cy = size/2
 *   Rspoke = size/2 - 6          (outer spoke ring radius)
 *   spokeW = max(7, size * 0.05) (spoke stroke width)
 *   Rmain  = Rspoke - spokeW - 5 (overall completion ring radius)
 *   mainW  = max(8, size * 0.055)
 *   For each bucket: angularShare = (bucket.totalHours / total) * 360 - gapDeg
 *   Spoke fill arc end = a0 + angularShare * min(1, bucket.doneHours / bucket.totalHours)
 *
 * a11y: role="img" + aria-label summarizing overall state.
 */

import type { BucketView } from '@/types';

// Map BucketView category to inline hsl values — SVG stroke doesn't inherit
// Tailwind classes, so we use the same brand token values as CATEGORY_BG/TEXT.
const CATEGORY_STROKE: Record<BucketView['category'], string> = {
  ece_core: 'hsl(16 70% 50%)',
  tech_core: 'hsl(85 50% 42%)',
  gen_ed: 'hsl(40 72% 47%)',
  elective: 'hsl(220 8% 55%)',
  math: 'hsl(255 38% 58%)',
};

interface DegreeRadialProps {
  buckets: BucketView[];
  /** Overall completion percentage 0–100 */
  pct: number;
  /** Total done hours */
  done: number;
  /** Total target hours */
  total: number;
  /** Graduation term label (e.g. "Spring 2028") — used in aria-label */
  gradTerm?: string | null;
  /** Hours remaining to degree completion */
  hrsToGo?: number;
  /** SVG dimensions in px (default 220) */
  size?: number;
}

export function DegreeRadial({
  buckets,
  pct,
  done,
  total,
  gradTerm,
  hrsToGo,
  size = 220,
}: DegreeRadialProps) {
  const cx = size / 2;
  const cy = size / 2;

  const Rspoke = size / 2 - 6;
  const spokeW = Math.max(7, size * 0.05);
  const Rmain = Rspoke - spokeW - 5;
  const mainW = Math.max(8, size * 0.055);
  const circ = 2 * Math.PI * Rmain;

  const GAP_DEG = 2;

  // Convert polar (r, angleDeg) → [x, y] with 0° = right, -90° = 12 o'clock.
  const polar = (r: number, aDeg: number): [number, number] => [
    cx + r * Math.cos((aDeg * Math.PI) / 180),
    cy + r * Math.sin((aDeg * Math.PI) / 180),
  ];

  const arcPath = (r: number, a0: number, a1: number): string => {
    const [x0, y0] = polar(r, a0);
    const [x1, y1] = polar(r, a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };

  // Build spoke path elements
  const spokeElements: React.ReactNode[] = [];
  let ang = -90; // start at 12 o'clock

  for (const bucket of buckets) {
    const share = (bucket.totalHours / total) * 360 - GAP_DEG;
    if (share <= 0) continue;

    const a0 = ang + GAP_DEG / 2;
    const a1 = a0 + share;

    // Track arc (muted)
    spokeElements.push(
      <path
        key={`track-${bucket.id}`}
        d={arcPath(Rspoke, a0, a1)}
        stroke="var(--muted, hsl(30 8% 45% / 0.25))"
        strokeWidth={spokeW}
        fill="none"
        strokeLinecap="round"
        style={{ stroke: 'color-mix(in srgb, currentColor 20%, transparent)' }}
        className="text-muted-foreground"
      />
    );

    // Fill arc ∝ completion
    const completion = bucket.totalHours > 0
      ? Math.min(1, bucket.doneHours / bucket.totalHours)
      : 0;
    const fillA1 = a0 + share * completion;

    if (fillA1 > a0 + 0.5) {
      spokeElements.push(
        <path
          key={`fill-${bucket.id}`}
          d={arcPath(Rspoke, a0, fillA1)}
          stroke={CATEGORY_STROKE[bucket.category]}
          strokeWidth={spokeW}
          fill="none"
          strokeLinecap="round"
        />
      );
    }

    ang = a1 + GAP_DEG / 2;
  }

  // Overall ring
  const clampedPct = Math.min(100, Math.max(0, pct));
  const dash = circ * (clampedPct / 100);

  // Center text sizes
  const centerBig = Math.max(20, size * 0.16);
  const centerSm = Math.max(11, size * 0.075);

  const ariaLabel = gradTerm
    ? `${clampedPct}% complete, ${done} of ${total} credit hours, on track for ${gradTerm}`
    : hrsToGo != null && hrsToGo > 0
    ? `${clampedPct}% complete, ${done} of ${total} credit hours, ${hrsToGo} hrs to go`
    : `${clampedPct}% complete, ${done} of ${total} credit hours`;

  const onTrackText =
    pct >= 100
      ? 'complete!'
      : gradTerm
      ? 'on track'
      : '';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={ariaLabel}
      className="flex-none"
    >
      {/* Overall completion ring — track */}
      <circle
        cx={cx}
        cy={cy}
        r={Rmain}
        fill="none"
        className="text-muted-foreground/20"
        stroke="currentColor"
        strokeWidth={mainW}
      />
      {/* Overall completion ring — fill (terracotta) */}
      <circle
        cx={cx}
        cy={cy}
        r={Rmain}
        fill="none"
        stroke="hsl(18 58% 50%)"
        strokeWidth={mainW}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />

      {/* Per-bucket spokes */}
      {spokeElements}

      {/* Center text */}
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        fontSize={centerBig}
        fontWeight="700"
        className="fill-foreground"
        fill="currentColor"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {clampedPct}%
      </text>
      <text
        x={cx}
        y={cy + centerSm + 4}
        textAnchor="middle"
        fontSize={centerSm}
        className="fill-muted-foreground"
        fill="currentColor"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {done} / {total}
      </text>
      {onTrackText && (
        <text
          x={cx}
          y={cy + centerSm * 2 + 6}
          textAnchor="middle"
          fontSize={centerSm * 0.85}
          fontWeight="600"
          fill="hsl(18 58% 50%)"
        >
          {onTrackText}
        </text>
      )}
    </svg>
  );
}
