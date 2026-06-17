import { useState, useMemo, useCallback } from 'react';
import { useDroppable, useDndMonitor } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { getCourseCredits, seasonEmoji } from '@/lib/course-utils';
import { usePlanDispatch } from '@/context/PlanContext';
import CourseCard from './CourseCard';
import type { Semester, CourseCatalog, PrereqNode, PrereqViolation, GradeDistributions } from '@/types';
// TASK-024: workload heat stripe
import { computeSemesterDifficulty, HEAT_STRIPE_CLASS } from '@/lib/workload';
import { getCreditHourCap } from '@/lib/auto-planner';

// ─── Sortable course card (timeline cards that can be dragged/reordered) ─────

interface SortableCourseCardProps {
  /** Globally unique ID for dnd-kit (format: "timeline-{semesterId}-{courseId}") */
  id: string;
  courseId: string;
  semesterId: string;
  semesterStatus: 'past' | 'current' | 'future';
  letterGrade?: string;
  catalog: CourseCatalog | null;
  prereqNodes: Record<string, PrereqNode>;
  gradeDistributions: GradeDistributions;
  violation?: PrereqViolation;
  isDownstreamHighlight?: boolean;
  isUpstreamHighlight?: boolean;
  isUnverifiedOffering?: boolean;
  isPinned?: boolean;
  onTogglePin?: (courseId: string) => void;
  controlsLayout?: 'corner' | 'side';
}

function SortableCourseCard({
  id,
  courseId,
  semesterId,
  semesterStatus,
  letterGrade,
  catalog,
  prereqNodes,
  gradeDistributions,
  violation,
  isDownstreamHighlight,
  isUpstreamHighlight,
  isUnverifiedOffering,
  isPinned,
  onTogglePin,
  controlsLayout,
}: SortableCourseCardProps) {
  const dispatch = usePlanDispatch();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: {
      type: 'course',
      courseId,
      source: 'timeline',
      semesterId,
    },
  });

  // Explicit remove affordance (TASK-080 BUG 2) — same action the drag-to-palette
  // path dispatches, so totals/validation update identically.
  const handleRemove = useCallback(
    (id: string) => dispatch({ type: 'REMOVE_COURSE', semesterId, courseId: id }),
    [dispatch, semesterId],
  );

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform) ?? undefined,
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
      <CourseCard
        courseId={courseId}
        semesterStatus={semesterStatus}
        letterGrade={letterGrade}
        catalog={catalog}
        prereqNodes={prereqNodes}
        gradeDistributions={gradeDistributions}
        isDragging={isDragging}
        violation={violation}
        isDownstreamHighlight={isDownstreamHighlight}
        isUpstreamHighlight={isUpstreamHighlight}
        isUnverifiedOffering={isUnverifiedOffering}
        isPinned={isPinned}
        onTogglePin={onTogglePin}
        onRemove={handleRemove}
        controlsLayout={controlsLayout}
      />
    </div>
  );
}

// ─── Season icon ───────────────────────────────────────────────────────────────

function SeasonIcon({ season }: { season: 'Fall' | 'Spring' | 'Summer' }) {
  return <span aria-hidden="true">{seasonEmoji(season)}</span>;
}

// ─── Credit-count color ────────────────────────────────────────────────────────

function creditCountClass(credits: number, cap: number): string {
  if (credits > cap) return 'text-red-500 font-semibold';
  if (credits === cap) return 'text-yellow-500 font-semibold';
  return 'text-green-600 dark:text-green-400';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SemesterColumnProps {
  semester: Semester;
  courseIds: string[];
  /** Map from courseId → grade (for past semesters) */
  gradeMap: Record<string, string>;
  /** Data from DataContext */
  catalog: CourseCatalog | null;
  prereqNodes: Record<string, PrereqNode>;
  gradeDistributions: GradeDistributions;
  /** courseId → credit_hours from user transcript (overrides catalog) */
  transcriptCredits: Record<string, number>;
  /** Violation data from useValidation (TASK-010) */
  violationsByCourse: Record<string, PrereqViolation>;
  /**
   * TASK-081 — course IDs in THIS semester that sit in an unverified future term
   * (no sections data) where their season-offering would otherwise block them.
   * Renders a subtle "(unverified offered)" note. Empty set = none flagged.
   */
  unverifiedOfferingCourses?: Set<string>;
  /** Set of courses to highlight as downstream dependents (TASK-010) */
  downstreamCourses: Set<string>;
  /** Set of courses to highlight as upstream prerequisites (TASK-024) */
  upstreamCourses?: Set<string>;
  // TASK-019: pin + ghost
  pinnedCourses?: string[];
  onTogglePin?: (courseId: string) => void;
  /** Ghost course IDs proposed by the solver for this semester */
  ghostCourseIds?: string[];
  onAcceptGhost?: (courseId: string, semesterId: string) => void;
  onRejectGhost?: (courseId: string) => void;
  /** Per-semester credit-hour cap from the user's selected load tolerance. Defaults to getCreditHourCap(null) (normal load). */
  creditHourCap?: number;
  /**
   * Suppress the column's own header (label + credit-hours + GPA row). Default OFF.
   * Used by FocusEditor, which surfaces the focused-semester label and credit-hours
   * in its own header to avoid a duplicate heading.
   */
  hideHeader?: boolean;
  /**
   * Layout for the per-course pin + remove controls on timeline (non-past) cards.
   * 'corner' (default) keeps the legacy bottom-right cluster; 'side' uses a wide
   * right gutter — passed by FocusEditor's roomy focus column. See CourseCard.
   */
  controlsLayout?: 'corner' | 'side';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SemesterColumn({
  semester,
  courseIds,
  gradeMap,
  catalog,
  prereqNodes,
  gradeDistributions,
  transcriptCredits,
  violationsByCourse,
  unverifiedOfferingCourses = new Set(),
  downstreamCourses,
  upstreamCourses = new Set(),
  pinnedCourses = [],
  onTogglePin,
  ghostCourseIds = [],
  onAcceptGhost,
  onRejectGhost,
  creditHourCap = getCreditHourCap(null),
  hideHeader = false,
  controlsLayout = 'corner',
}: SemesterColumnProps) {
  const { id, label, status, season } = semester;
  const isPast = status === 'past';
  const isCurrent = status === 'current';
  const isDroppable = !isPast; // past semesters are fixed; current + future accept drops

  // ── Droppable registration ─────────────────────────────────────────────────
  const { setNodeRef: setDroppableRef, isOver: isOverDirect } = useDroppable({
    id,
    disabled: isPast,
    data: { type: 'semester', semesterId: id },
  });

  // ── Highlight tracking via DnD monitor ────────────────────────────────────
  // useDroppable's isOver only fires when directly over the container area
  // (not when over sortable cards inside it). useDndMonitor captures the full
  // hover state for visual feedback.
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

  const showHighlight = isDroppable && (isActivelyOver || isOverDirect);

  // ── Sort IDs for SortableContext ───────────────────────────────────────────
  const sortableIds = courseIds.map((c) => `timeline-${id}-${c}`);

  // Compute total credits for the semester
  const totalCredits = useMemo(
    () => courseIds.reduce(
      (sum, courseId) => sum + getCourseCredits(courseId, catalog, transcriptCredits),
      0
    ),
    [courseIds, catalog, transcriptCredits]
  );

  // Compute estimated GPA for future/current semesters (Feature 4)
  const estimatedGPA = useMemo(() => {
    // guard divide-by-zero: a term whose courses sum to 0 credits has no credit-weighted GPA
    if (isPast || totalCredits === 0) return null;
    let weightedGpaSum = 0;
    let gpaCredits = 0;

    for (const courseId of courseIds) {
      const dist = gradeDistributions[courseId];
      if (dist && dist.avg_gpa > 0) {
        // Use transcriptCredits for weighting — same source as totalCredits above.
        const credits = getCourseCredits(courseId, catalog, transcriptCredits);
        weightedGpaSum += dist.avg_gpa * credits;
        gpaCredits += credits;
      }
    }

    return gpaCredits > 0 ? (weightedGpaSum / gpaCredits).toFixed(2) : null;
  }, [courseIds, catalog, transcriptCredits, gradeDistributions, isPast, totalCredits]);

  // TASK-024: workload heat-stripe — build a minimal plan object for the helper
  const { bucket: heatBucket } = useMemo(() => {
    const minimalPlan: Record<string, string[]> = { [id]: courseIds };
    return computeSemesterDifficulty(semester, minimalPlan, gradeDistributions, catalog);
  }, [id, courseIds, semester, gradeDistributions, catalog]);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 min-w-[180px] w-[180px] shrink-0 rounded-lg overflow-hidden',
        // Background tint by status
        isPast && 'bg-gray-50 dark:bg-gray-900/50',
        isCurrent && 'bg-background ring-2 ring-primary',
        !isPast && !isCurrent && 'bg-background'
      )}
    >
      {/* TASK-024: heat stripe — 4px decorative bar at top of column */}
      <div
        aria-hidden="true"
        className={cn('h-1 w-full shrink-0', HEAT_STRIPE_CLASS[heatBucket])}
      />

      {/* Inner content with padding (moved from outer to preserve stripe flush positioning) */}
      <div className="flex flex-col gap-2 px-2 pb-2">
        {/* ── Column Header ─────────────────────────────────────────── */}
        {!hideHeader && (
          <div
            className={cn(
              'flex flex-col gap-0.5 px-1 pb-1 border-b border-border',
              isPast && 'opacity-75'
            )}
          >
            {/* Semester label + season icon + status badge */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground flex items-center gap-1">
                <SeasonIcon season={season} />
                {label}
              </span>
              {isPast && (
                <span className="text-green-600 dark:text-green-400 text-sm font-bold" aria-label="Past semester">
                  ✓
                </span>
              )}
              {isCurrent && (
                <span className="text-[10px] bg-primary text-primary-foreground px-1 rounded font-medium">
                  NOW
                </span>
              )}
            </div>

            {/* Credit count & optional GPA */}
            <div className="flex items-center justify-between">
              <span className={cn('text-[11px]', creditCountClass(totalCredits, creditHourCap))}>
                {isPast ? `${totalCredits} hrs` : `${totalCredits} / ${creditHourCap} hrs`}
              </span>
              {estimatedGPA && (
                <span className="text-[10px] text-muted-foreground" title="Estimated GPA based on historical data">
                  ~{estimatedGPA} est. GPA
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Course List (droppable + sortable for non-past) ──────── */}
        {isPast ? (
          // Past semesters: static, non-draggable cards
          <div className="flex flex-col gap-1.5">
            {courseIds.map((courseId) => (
              <CourseCard
                key={courseId}
                courseId={courseId}
                semesterStatus={status}
                letterGrade={gradeMap[courseId]}
                catalog={catalog}
                prereqNodes={prereqNodes}
                gradeDistributions={gradeDistributions}
                violation={violationsByCourse[courseId]}
                isDownstreamHighlight={downstreamCourses.has(courseId)}
                isUpstreamHighlight={upstreamCourses.has(courseId)}
              />
            ))}
          </div>
        ) : (
          // Current / future semesters: droppable + sortable
          <div
            ref={setDroppableRef}
            className={cn(
              'flex flex-col gap-1.5 min-h-[64px] rounded-md p-1 transition-colors duration-150',
              showHighlight
                ? 'bg-accent/30 dark:bg-accent/10 border border-primary/40'
                : 'border border-transparent'
            )}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {courseIds.map((courseId) => (
                <SortableCourseCard
                  key={courseId}
                  id={`timeline-${id}-${courseId}`}
                  courseId={courseId}
                  semesterId={id}
                  semesterStatus={status}
                  letterGrade={gradeMap[courseId]}
                  catalog={catalog}
                  prereqNodes={prereqNodes}
                  gradeDistributions={gradeDistributions}
                  violation={violationsByCourse[courseId]}
                  isDownstreamHighlight={downstreamCourses.has(courseId)}
                  isUpstreamHighlight={upstreamCourses.has(courseId)}
                  isUnverifiedOffering={unverifiedOfferingCourses.has(courseId)}
                  isPinned={pinnedCourses.includes(courseId)}
                  onTogglePin={onTogglePin}
                  controlsLayout={controlsLayout}
                />
              ))}
            </SortableContext>

            {/* Ghost cards — solver proposals */}
            {ghostCourseIds.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-0.5">
                {ghostCourseIds.map((courseId) => (
                  <CourseCard
                    key={`ghost-${courseId}`}
                    courseId={courseId}
                    semesterStatus={status}
                    catalog={catalog}
                    prereqNodes={prereqNodes}
                    gradeDistributions={gradeDistributions}
                    isGhost
                    ghostSemesterId={id}
                    onAcceptGhost={onAcceptGhost}
                    onRejectGhost={onRejectGhost}
                  />
                ))}
              </div>
            )}

            {/* Empty drop hint */}
            {courseIds.length === 0 && ghostCourseIds.length === 0 && (
              <div
                className={cn(
                  'border-2 border-dashed rounded-lg p-3 h-14',
                  'flex items-center justify-center',
                  'text-sm transition-colors duration-150',
                  showHighlight
                    ? 'border-primary/60 text-primary'
                    : 'border-border text-muted-foreground'
                )}
              >
                Drop course here
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
