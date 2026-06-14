/**
 * MobileSemesterCard — a large, touch-friendly semester card for the minimalist
 * shell's narrow-viewport plan list.
 *
 * Unlike the dense desktop SemesterTile (10–11px text, ~96px tall), this card is
 * built mobile-first: ≥44px tap target, 14–16px text, full course list (no
 * "+N more" truncation) so a tap shows the whole term at a glance before opening
 * the editor sheet. It is a plain <button>; it is NOT a dnd-kit droppable — drag
 * editing happens inside the sheet (SemesterColumn), which is the touch model the
 * design calls for.
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getCourseCredits, inferCategory } from '@/lib/course-utils';
import type { StressBand, SemesterStressResult } from '@/lib/stress-score';
import type { Semester, CourseCatalog, PrereqNode } from '@/types';

// ─── Category dot colors (mirrors SemesterTile) ───────────────────────────────

const CATEGORY_DOT: Record<string, string> = {
  ece_core:  'bg-[hsl(16_70%_50%)]',
  tech_core: 'bg-[hsl(85_50%_42%)]',
  gen_ed:    'bg-[hsl(40_72%_47%)]',
  elective:  'bg-[hsl(220_8%_55%)]',
  math:      'bg-[hsl(255_38%_58%)]',
};

const STRESS_BAND_BADGE: Record<StressBand, string> = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const STRESS_BAND_LABEL: Record<StressBand, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

function seasonEmoji(season: 'Fall' | 'Spring' | 'Summer'): string {
  if (season === 'Fall') return '🍂';
  if (season === 'Spring') return '🌸';
  return '☀️';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MobileSemesterCardProps {
  semester: Semester;
  courseIds: string[];
  catalog: CourseCatalog | null;
  prereqNodes: Record<string, PrereqNode>;
  transcriptCredits: Record<string, number>;
  creditHourCap: number;
  stressResult: SemesterStressResult | null;
  isFocused: boolean;
  onClick: () => void;
}

export default function MobileSemesterCard({
  semester,
  courseIds,
  catalog,
  prereqNodes,
  transcriptCredits,
  creditHourCap,
  stressResult,
  isFocused,
  onClick,
}: MobileSemesterCardProps) {
  const { label, status, season } = semester;
  const isPast = status === 'past';
  const isCurrent = status === 'current';

  const totalCredits = useMemo(
    () =>
      courseIds.reduce(
        (sum, cId) => sum + getCourseCredits(cId, catalog, transcriptCredits),
        0,
      ),
    [courseIds, catalog, transcriptCredits],
  );

  const overCap = !isPast && totalCredits > creditHourCap;
  const atCap = !isPast && totalCredits === creditHourCap;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}, ${totalCredits} credit hours, ${courseIds.length} courses${isFocused ? ', currently open' : ''}`}
      className={cn(
        // Touch target: comfortably ≥44px, generous padding, readable text.
        'w-full text-left rounded-xl border bg-background p-3 min-h-[64px]',
        'transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'active:scale-[0.99]',
        isPast && 'bg-muted/40',
        isCurrent && 'ring-2 ring-primary border-transparent',
        !isPast && !isCurrent && 'border-border',
        isFocused && 'ring-2 ring-primary shadow-md',
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-base font-semibold text-foreground truncate">
          <span aria-hidden="true">{seasonEmoji(season)}</span>
          <span className="truncate">{label}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {isPast && (
            <span className="text-green-600 dark:text-green-400 text-sm font-bold" aria-label="Past semester">
              ✓
            </span>
          )}
          {isCurrent && (
            <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">
              NOW
            </span>
          )}
          {stressResult !== null && courseIds.length > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold',
                STRESS_BAND_BADGE[stressResult.band],
              )}
              aria-label={`Stress: ${STRESS_BAND_LABEL[stressResult.band]} (${stressResult.score}/100)`}
            >
              {STRESS_BAND_LABEL[stressResult.band]}
              <span className="font-mono opacity-80">{stressResult.score}</span>
            </span>
          )}
        </div>
      </div>

      {/* Credit count */}
      <div className="mt-1">
        <span
          className={cn(
            'text-sm',
            overCap
              ? 'text-red-500 font-semibold'
              : atCap
                ? 'text-yellow-600 dark:text-yellow-500 font-semibold'
                : 'text-muted-foreground',
          )}
        >
          {isPast ? `${totalCredits} hrs` : `${totalCredits}/${creditHourCap} hrs`}
        </span>
      </div>

      {/* Course list — full, no truncation; mobile scrolls vertically anyway. */}
      {courseIds.length === 0 ? (
        <div className="mt-2 flex items-center justify-center rounded-lg border border-dashed border-border/50 py-3 text-sm text-muted-foreground/60">
          {isPast ? '—' : 'Tap to add courses'}
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {courseIds.map((cId) => {
            const category = inferCategory(cId, prereqNodes);
            const dotColor = CATEGORY_DOT[category] ?? 'bg-gray-400';
            return (
              <li key={cId} className="flex items-center gap-2 min-w-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', dotColor)} aria-hidden="true" />
                <span className="text-sm text-foreground/80 truncate">{cId}</span>
              </li>
            );
          })}
        </ul>
      )}
    </button>
  );
}
