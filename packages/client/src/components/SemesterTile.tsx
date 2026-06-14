/**
 * SemesterTile — compact overview cell for the year-grid.
 *
 * Shows: term label + season emoji, credit count, status badge,
 * 4px workload heat stripe, course chips (code + category dot), overflow "+N more",
 * and a Stress Score badge (TASK-059: band color + 0–100 score + hover breakdown).
 * Also acts as a droppable target (extends the single DndContext in PlannerPage).
 */

import { useMemo } from 'react';
import { useDroppable, useDndMonitor } from '@dnd-kit/core';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getCourseCredits, inferCategory } from '@/lib/course-utils';
import { computeSemesterDifficulty, type HeatBucket } from '@/lib/workload';
import { getCreditHourCap } from '@/lib/auto-planner';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import type { StressBand, SemesterStressResult } from '@/lib/stress-score';
import type { Semester, CourseCatalog, PrereqNode, GradeDistributions } from '@/types';
import { usePlanDispatch } from '@/context/PlanContext';
import { useUi } from '@/context/UiContext';
import { track } from '@/lib/analytics';

// ─── Heat stripe colors (same mapping as SemesterColumn) ─────────────────────

const HEAT_COLOR: Record<HeatBucket, string> = {
  green:  'bg-green-400',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-400',
  red:    'bg-red-500',
};

// ─── Category dot colors ──────────────────────────────────────────────────────

const CATEGORY_DOT: Record<string, string> = {
  ece_core:  'bg-[hsl(16_70%_50%)]',
  tech_core: 'bg-[hsl(85_50%_42%)]',
  gen_ed:    'bg-[hsl(40_72%_47%)]',
  elective:  'bg-[hsl(220_8%_55%)]',
  math:      'bg-[hsl(255_38%_58%)]',
};

// ─── Season emoji ─────────────────────────────────────────────────────────────

function seasonEmoji(season: 'Fall' | 'Spring' | 'Summer'): string {
  if (season === 'Fall') return '🍂';
  if (season === 'Spring') return '🌸';
  return '☀️';
}

// ─── Props ────────────────────────────────────────────────────────────────────

// ─── Stress badge colors ──────────────────────────────────────────────────────

const STRESS_BAND_BADGE: Record<StressBand, string> = {
  low:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  high:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const STRESS_BAND_LABEL: Record<StressBand, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface SemesterTileProps {
  semester: Semester;
  courseIds: string[];
  catalog: CourseCatalog | null;
  prereqNodes: Record<string, PrereqNode>;
  gradeDistributions: GradeDistributions;
  transcriptCredits: Record<string, number>;
  isFocused: boolean;
  /** Slack label from diagnostics, e.g. "14 hrs spare" or "full". Null for past/current semesters. */
  slackLabel?: string | null;
  /** Per-semester credit-hour cap from the user's selected load tolerance. Defaults to getCreditHourCap(null) (normal load). */
  creditHourCap?: number;
  /** Stress Score result for this semester (TASK-059). Null while loading. */
  stressResult?: SemesterStressResult | null;
  onClick: () => void;
}

// ─── Stress badge (TASK-059) ──────────────────────────────────────────────────

function StressBadge({ stressResult }: { stressResult: SemesterStressResult }) {
  const { score, band, courses, coursesWithData, totalCourses } = stressResult;
  const badgeClasses = STRESS_BAND_BADGE[band];
  const bandLabel = STRESS_BAND_LABEL[band];

  // Build the tooltip content
  const coverageText =
    coursesWithData === totalCourses
      ? `${totalCourses} courses with data`
      : `${coursesWithData}/${totalCourses} courses with data`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-semibold leading-4 shrink-0 cursor-default',
            badgeClasses,
          )}
          aria-label={`Stress: ${bandLabel} (${score}/100)`}
          onClick={(e) => e.stopPropagation()}
        >
          <span>{bandLabel}</span>
          <span className="font-mono opacity-80">{score}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        className="max-w-[200px] p-2 text-[11px] leading-tight"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <div className="font-semibold text-[11px]">
            Stress Score: {score}/100 ({bandLabel})
          </div>
          <div className="text-muted-foreground text-[10px]">{coverageText}</div>
          <div className="flex flex-col gap-0.5 mt-0.5">
            {courses
              .filter((c) => c.creditHours > 0)
              .map((c) => (
                <div key={c.courseId} className="flex items-center justify-between gap-2">
                  <span className={cn('font-mono truncate max-w-[120px]', c.hasNoData && 'opacity-60')}>
                    {c.courseId}{c.hasNoData ? '*' : ''}
                  </span>
                  <span className="tabular-nums">{c.difficulty}</span>
                </div>
              ))}
          </div>
          {coursesWithData < totalCourses && (
            <div className="text-muted-foreground text-[9px] mt-0.5 italic">
              * no grade data — using neutral default (50)
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Course chip ──────────────────────────────────────────────────────────────

const MAX_CHIPS = 8;

function CourseChip({
  courseId,
  semesterLabel,
  prereqNodes,
  isPast,
  isHighlighted,
  onRemove,
}: {
  courseId: string;
  semesterLabel: string;
  prereqNodes: Record<string, PrereqNode>;
  isPast: boolean;
  isHighlighted: boolean;
  onRemove: (courseId: string) => void;
}) {
  const category = inferCategory(courseId, prereqNodes);
  const dotColor = CATEGORY_DOT[category] ?? 'bg-gray-400';
  return (
    <span
      data-course-id={courseId}
      className={cn(
        'group flex items-center gap-0.5 min-w-0 overflow-hidden rounded-sm',
        isHighlighted && 'ring-2 ring-primary animate-pulse',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColor)} aria-hidden="true" />
      <span className="text-[10px] leading-tight truncate text-foreground/80 flex-1 min-w-0">{courseId}</span>
      {!isPast && (
        <button
          type="button"
          aria-label={`Remove ${courseId} from ${semesterLabel}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(courseId);
          }}
          className={cn(
            'shrink-0 h-3 w-3 rounded-full flex items-center justify-center',
            'opacity-0 group-hover:opacity-100 focus:opacity-100',
            'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
            'transition-opacity duration-100',
          )}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 8 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="h-2 w-2"
          >
            <line x1="1" y1="1" x2="7" y2="7" />
            <line x1="7" y1="1" x2="1" y2="7" />
          </svg>
        </button>
      )}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SemesterTile({
  semester,
  courseIds,
  catalog,
  prereqNodes,
  gradeDistributions,
  transcriptCredits,
  isFocused,
  slackLabel = null,
  creditHourCap = getCreditHourCap(null),
  stressResult = null,
  onClick,
}: SemesterTileProps) {
  const { id, label, status, season } = semester;
  const isPast = status === 'past';
  const isCurrent = status === 'current';

  const dispatch = usePlanDispatch();
  const { highlightedCourseId } = useUi();

  function handleRemoveCourse(courseId: string) {
    dispatch({ type: 'REMOVE_COURSE', semesterId: id, courseId });
    track('course_removed', { via: 'tile-x' });
  }

  // ── Droppable (future + current accept drops) ─────────────────────────────
  const isDroppable = !isPast;
  const { setNodeRef, isOver: isOverDirect } = useDroppable({
    id,
    disabled: isPast,
    data: { type: 'semester', semesterId: id },
  });

  // Track hover state via DnD monitor (same pattern as SemesterColumn)
  const [isActivelyOver, setIsActivelyOver] = useState(false);
  useDndMonitor({
    onDragOver({ over }) {
      if (isPast) return;
      const overData = over?.data.current;
      const mine =
        (overData?.type === 'semester' && overData.semesterId === id) ||
        (overData?.type === 'course' && overData.source === 'timeline' && overData.semesterId === id);
      setIsActivelyOver(Boolean(mine));
    },
    onDragEnd() { setIsActivelyOver(false); },
    onDragCancel() { setIsActivelyOver(false); },
  });

  const showDropHighlight = isDroppable && (isActivelyOver || isOverDirect);

  // ── Credits ───────────────────────────────────────────────────────────────
  const totalCredits = useMemo(
    () => courseIds.reduce(
      (sum, cId) => sum + getCourseCredits(cId, catalog, transcriptCredits),
      0
    ),
    [courseIds, catalog, transcriptCredits]
  );

  // ── Workload heat bucket ──────────────────────────────────────────────────
  const { bucket } = useMemo(() => {
    const minimalPlan: Record<string, string[]> = { [id]: courseIds };
    return computeSemesterDifficulty(semester, minimalPlan, gradeDistributions, catalog);
  }, [id, courseIds, semester, gradeDistributions, catalog]);

  // ── Chip overflow ─────────────────────────────────────────────────────────
  const visibleCourses = courseIds.slice(0, MAX_CHIPS);
  const overflowCount = courseIds.length - MAX_CHIPS;

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      aria-label={`${label}, ${totalCredits} credit hours, ${courseIds.length} courses${isFocused ? ', currently focused' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        // Base sizing — fits within ~118px row height, ~170px width
        'relative flex flex-col w-full h-full min-h-[96px] rounded-lg overflow-hidden text-left',
        'transition-shadow duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        // Background/border by status
        isPast && 'bg-gray-50 dark:bg-gray-900/50',
        isCurrent && 'bg-background ring-2 ring-primary',
        !isPast && !isCurrent && 'bg-background border border-border',
        // Focused state (zoomed tile)
        isFocused && 'ring-2 ring-primary shadow-md',
        // Drop highlight
        showDropHighlight && 'ring-2 ring-primary/60 bg-accent/30 dark:bg-accent/10',
        // Hover (non-focused, non-drop)
        !isFocused && !showDropHighlight && 'hover:shadow-sm hover:border-border/80',
      )}
    >
      {/* Heat stripe */}
      <div
        aria-hidden="true"
        className={cn('h-1 w-full shrink-0', HEAT_COLOR[bucket])}
      />

      {/* Content */}
      <div className="flex flex-col gap-1 px-2 pt-1.5 pb-2 flex-1 min-h-0">
        {/* Header row: label + status badge */}
        <div className="flex items-center justify-between gap-1 shrink-0">
          <span className="text-[11px] font-semibold text-foreground flex items-center gap-0.5 truncate">
            <span aria-hidden="true">{seasonEmoji(season)}</span>
            <span className="truncate">{label}</span>
          </span>
          {isPast && (
            <span className="text-green-600 dark:text-green-400 text-[10px] font-bold shrink-0" aria-label="Past semester">
              ✓
            </span>
          )}
          {isCurrent && (
            <span className="text-[9px] bg-primary text-primary-foreground px-1 rounded font-medium shrink-0">
              NOW
            </span>
          )}
        </div>

        {/* Meta line: hours · slack · stress badge — all on one row */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <span className={cn(
            'text-[10px] leading-none',
            // Past tiles: never show over-cap-red — historical load is not constrainable.
            !isPast && totalCredits > creditHourCap ? 'text-red-500 font-semibold' :
            !isPast && totalCredits === creditHourCap ? 'text-yellow-500 font-semibold' :
            'text-muted-foreground'
          )}>
            {isPast ? `${totalCredits} hrs` : `${totalCredits}/${creditHourCap} hrs`}
          </span>
          {slackLabel && (
            <span
              className={cn(
                'text-[9px] leading-none shrink-0',
                slackLabel === 'full'
                  ? 'text-amber-500 font-semibold'
                  : 'text-emerald-600 dark:text-emerald-400',
              )}
              aria-label={`Slack: ${slackLabel}`}
            >
              {slackLabel === 'full' ? '● full' : `+${slackLabel.replace(/ hrs? spare$/, '')} spare`}
            </span>
          )}
          {stressResult !== null && courseIds.length > 0 && (
            <StressBadge stressResult={stressResult} />
          )}
        </div>

        {/* Course chips */}
        {courseIds.length === 0 ? (
          <div className={cn(
            'flex-1 flex items-center justify-center',
            'border border-dashed rounded text-[10px] text-muted-foreground/50',
            showDropHighlight ? 'border-primary/60' : 'border-border/40',
          )}>
            {isDroppable ? 'empty' : '—'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 flex-1 min-h-0 overflow-hidden">
            {visibleCourses.map((cId) => (
              <CourseChip
                key={cId}
                courseId={cId}
                semesterLabel={label}
                prereqNodes={prereqNodes}
                isPast={isPast}
                isHighlighted={cId === highlightedCourseId}
                onRemove={handleRemoveCourse}
              />
            ))}
            {overflowCount > 0 && (
              <span className="col-span-2 text-[10px] text-muted-foreground/70 pl-2">
                +{overflowCount} more
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
