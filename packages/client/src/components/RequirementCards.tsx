/**
 * RequirementCard + RequirementCards — TASK-098 Increment 4
 *
 * One card per bucket. Anatomy (per spec §3.4):
 *   1. Header row: bucket name + done/total hrs + mini-bar.
 *   2. Rule line: human-readable requirement note.
 *   3. Status chips: ✓/~/✗ for sub-requirements (gen-ed slots, tech sub-reqs).
 *   4. "Still need:" block: bucket.remaining[] entries.
 *
 * Completed buckets (complete:true) render a compact "✓ Complete" card with
 * the satisfied course IDs shown as static chips — no "still need" block.
 *
 * Grid: grid-cols-3 ≥1024px, grid-cols-2 768–1023px, grid-cols-1 mobile.
 * Incomplete buckets first; completed ✓ cards last.
 *
 * A11y:
 *   - Colored text uses CATEGORY_TEXT (AA-safe variants).
 *   - Completion conveyed by ✓ glyph + numbers, not color alone.
 */

import { CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CATEGORY_BG, CATEGORY_TEXT } from '@/lib/course-utils';
import type { BucketView } from '@/types';

// ─── Mini progress bar ────────────────────────────────────────────────────────

function MiniBar({
  pct,
  category,
}: {
  pct: number;
  category: BucketView['category'];
}) {
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn('h-full rounded-full transition-all', CATEGORY_BG[category])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────────

const CHIP_STATUS_CLASS = {
  done: 'text-[hsl(85_50%_36%)] dark:text-[hsl(85_50%_55%)] border-[hsl(85_50%_42%/0.4)]',
  partial: 'text-[hsl(40_72%_38%)] dark:text-[hsl(40_72%_58%)] border-[hsl(40_72%_47%/0.4)]',
  missing: 'text-muted-foreground border-dashed',
} as const;

const CHIP_MARK = {
  done: '✓',
  partial: '~',
  missing: '✗',
} as const;

function SubChip({
  label,
  status,
}: {
  label: string;
  status: 'done' | 'partial' | 'missing';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap',
        CHIP_STATUS_CLASS[status]
      )}
    >
      {CHIP_MARK[status]} {label}
    </span>
  );
}

// ─── RequirementCard ─────────────────────────────────────────────────────────

interface RequirementCardProps {
  bucket: BucketView;
}

export function RequirementCard({ bucket }: RequirementCardProps) {
  const pct = bucket.totalHours > 0
    ? Math.min(100, Math.round((bucket.doneHours / bucket.totalHours) * 100))
    : 0;

  const hrsLabel =
    bucket.doneCount !== undefined && bucket.totalCount !== undefined
      ? `${bucket.doneHours}/${bucket.totalHours} hrs · ${bucket.doneCount}/${bucket.totalCount} ${bucket.countNoun ?? ''}`
      : `${bucket.doneHours}/${bucket.totalHours} hrs`;

  // ── Completed card ──────────────────────────────────────────────────────────
  if (bucket.complete) {
    return (
      <Card className="p-4" data-testid={`req-card-${bucket.id}`}>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className={cn('text-sm font-bold', CATEGORY_TEXT[bucket.category])}>
            {bucket.label}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(85_50%_42%)]" aria-hidden="true" />
            {bucket.doneHours}/{bucket.totalHours} hrs
          </span>
        </div>

        <MiniBar pct={100} category={bucket.category} />

        {/* Satisfied course IDs as static chips */}
        {bucket.subRequirements && bucket.subRequirements.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {bucket.subRequirements.map((sub) => (
              <SubChip key={sub.label} label={sub.label} status={sub.status} />
            ))}
          </div>
        )}

        <p className="mt-2 text-xs text-[hsl(85_50%_36%)] dark:text-[hsl(85_50%_55%)] font-medium">
          ✓ Complete
        </p>
      </Card>
    );
  }

  // ── In-progress card ────────────────────────────────────────────────────────

  // Determine rule line
  let ruleLine: string | undefined;
  if (bucket.doneCount !== undefined && bucket.totalCount !== undefined && bucket.countNoun) {
    ruleLine = `${bucket.doneCount} of ${bucket.totalCount} ${bucket.countNoun} done`;
  }
  if (bucket.ruleNote) {
    ruleLine = ruleLine ? `${ruleLine} · ${bucket.ruleNote}` : bucket.ruleNote;
  }

  return (
    <Card className="p-4" data-testid={`req-card-${bucket.id}`}>
      {/* Header */}
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className={cn('text-sm font-bold', CATEGORY_TEXT[bucket.category])}>
          {bucket.label}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {hrsLabel}
        </span>
      </div>

      <MiniBar pct={pct} category={bucket.category} />

      {/* Rule line */}
      {ruleLine && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">{ruleLine}</p>
      )}

      {/* Sub-requirement chips */}
      {bucket.subRequirements && bucket.subRequirements.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {bucket.subRequirements.map((sub) => (
            <SubChip key={sub.label} label={sub.label} status={sub.status} />
          ))}
        </div>
      )}

      {/* Still need block */}
      {bucket.remaining && bucket.remaining.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] font-bold text-foreground mb-1">Still need:</p>
          <ul className="space-y-0.5">
            {bucket.remaining.map((item, idx) => (
              <li
                key={item.courseId != null ? `${item.courseId}-${idx}` : idx}
                className="relative pl-3 text-[11.5px] text-foreground"
              >
                <span
                  className="absolute left-0.5 text-[hsl(18_58%_50%)]"
                  aria-hidden="true"
                >
                  •
                </span>
                {item.courseId && (
                  <span className="font-semibold">{item.courseId} </span>
                )}
                {item.title && (
                  <span className="text-muted-foreground">{item.title}</span>
                )}
                {!item.courseId && item.note && (
                  <span className="text-muted-foreground">{item.note}</span>
                )}
                {item.courseId && item.note && (
                  <span className="text-muted-foreground text-[10.5px]"> ({item.note})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ─── RequirementCards grid ────────────────────────────────────────────────────

interface RequirementCardsProps {
  buckets: BucketView[];
}

export function RequirementCards({ buckets }: RequirementCardsProps) {
  // Incomplete buckets first, then completed ✓ cards
  const sorted = [...buckets].sort((a, b) => {
    if (a.complete === b.complete) return 0;
    return a.complete ? 1 : -1;
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((bucket) => (
        <RequirementCard key={bucket.id} bucket={bucket} />
      ))}
    </div>
  );
}
