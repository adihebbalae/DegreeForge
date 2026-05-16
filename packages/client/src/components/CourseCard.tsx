import { useMemo, useState } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { inferCategory, CATEGORY_BORDER, getCourseCredits, getCourseTitle, gpaColorClass, buildTranscriptCredits } from '@/lib/course-utils';
import type { CourseCatalog, CourseCategory, PrereqNode, PrereqViolation, GradeDistributions } from '@/types';
import { usePlanDispatch } from '@/context/PlanContext';
import { useUserProfile } from '@/context/DataContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import CourseDetailDialog from './CourseDetailDialog';

interface CourseCardProps {
  courseId: string;
  /** Status of the semester this card lives in (defaults to 'future') */
  semesterStatus?: 'past' | 'current' | 'future';
  /** Actual letter grade earned (past semesters only) */
  letterGrade?: string;
  /** Data from DataContext */
  catalog: CourseCatalog | null;
  prereqNodes: Record<string, PrereqNode>;
  gradeDistributions: GradeDistributions;
  /** Optional: override inferred category */
  categoryOverride?: CourseCategory;
  /** 'palette' = compact mode used in the course palette sidebar */
  variant?: 'palette';
  /** Whether all direct prereqs are met — palette only (default true) */
  prereqsMet?: boolean;
  /** True while this card is being actively dragged — renders ghost at 0.5 opacity */
  isDragging?: boolean;
  /** True when rendered inside a DragOverlay — adds floating shadow + slight rotation */
  isDragOverlay?: boolean;
  /** Prerequisite violation data (TASK-010) */
  violation?: PrereqViolation;
  /** Highlight as a downstream dependent of the hovered course (TASK-010) */
  isDownstreamHighlight?: boolean;
  // TASK-019: pin + ghost
  /** Whether this course is currently pinned by the user */
  isPinned?: boolean;
  /** Called when the pin button is clicked */
  onTogglePin?: (courseId: string) => void;
  /** Ghost card: solver-proposed, not yet in real plan */
  isGhost?: boolean;
  /** Called when ghost is accepted (click) */
  onAcceptGhost?: (courseId: string, semesterId: string) => void;
  /** Called when ghost is rejected (right-click / context menu) */
  onRejectGhost?: (courseId: string) => void;
  /** Semester this ghost belongs to (required when isGhost is true) */
  ghostSemesterId?: string;
}

export default function CourseCard({
  courseId,
  semesterStatus = 'future',
  letterGrade,
  catalog,
  prereqNodes,
  gradeDistributions,
  categoryOverride,
  variant,
  prereqsMet = true,
  isDragging = false,
  isDragOverlay = false,
  violation,
  isDownstreamHighlight = false,
  isPinned = false,
  onTogglePin,
  isGhost = false,
  onAcceptGhost,
  onRejectGhost,
  ghostSemesterId,
}: CourseCardProps) {
  const dispatch = usePlanDispatch();
  const profile = useUserProfile();
  const [detailOpen, setDetailOpen] = useState(false);

  const transcriptCredits = useMemo(() => buildTranscriptCredits(profile), [profile]);

  const category = categoryOverride ?? inferCategory(courseId, prereqNodes);
  const borderClass = CATEGORY_BORDER[category];

  const title = getCourseTitle(courseId, catalog, prereqNodes);
  const credits = getCourseCredits(courseId, catalog, prereqNodes, transcriptCredits);

  const avgGpa = gradeDistributions[courseId]?.avg_gpa ?? null;
  const gpaBgClass = gpaColorClass(avgGpa);

  const isPalette = variant === 'palette';
  const isPast = semesterStatus === 'past';
  const prereqDimmed = isPalette && !prereqsMet;

  // Violation styles
  const isPrereqViolation = violation?.violationType === 'prereq' || violation?.violationType === 'both';
  const isCoreqViolation = violation?.violationType === 'coreq';

  const violationBorder = isPrereqViolation 
    ? 'border-l-4 border-l-red-500 ring-1 ring-red-400' 
    : isCoreqViolation 
      ? 'border-l-4 border-l-amber-500 ring-1 ring-amber-400'
      : '';

  const highlightClass = isDownstreamHighlight 
    ? 'ring-1 ring-purple-400 bg-purple-50 dark:bg-purple-900/20' 
    : '';

  // ── Ghost card (solver-proposed, not yet accepted) ──────────────────────────
  if (isGhost) {
    return (
      <div
        onClick={() => ghostSemesterId && onAcceptGhost?.(courseId, ghostSemesterId)}
        onContextMenu={(e) => { e.preventDefault(); onRejectGhost?.(courseId); }}
        title={`${courseId} — ${title} (${credits} cr) · Click to accept, right-click to skip`}
        className={cn(
          'relative rounded-md overflow-hidden select-none',
          'border-2 border-dashed',
          'min-h-[72px] opacity-60',
          borderClass,
          'cursor-pointer hover:opacity-80 transition-opacity',
          'bg-card/50'
        )}
      >
        <div className="px-2 py-1.5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold text-foreground/70 italic leading-tight">
              {courseId}
            </span>
            {avgGpa !== null && (
              <span
                className={cn('text-[10px] font-bold px-1 rounded text-white/80 leading-tight', gpaBgClass)}
                title={`Avg GPA: ${avgGpa.toFixed(2)}`}
              >
                {avgGpa.toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-[11px] leading-tight mt-0.5 line-clamp-2 text-muted-foreground/60 italic">
            {title}
          </p>
        </div>
        {/* Ghost badge */}
        <span className="absolute bottom-1 right-1 text-[9px] text-muted-foreground/60 italic">
          suggestion
        </span>
      </div>
    );
  }

  const cardContent = (
    <div
      onMouseEnter={() => !isDragOverlay && dispatch({ type: 'SET_HOVERED_COURSE', courseId })}
      onMouseLeave={() => !isDragOverlay && dispatch({ type: 'SET_HOVERED_COURSE', courseId: null })}
      onClick={() => !isDragOverlay && setDetailOpen(true)}
      className={cn(
        'relative rounded-md bg-card shadow-sm overflow-hidden',
        'border border-border',
        'min-h-[72px]',       // Consistent card height across all variants
        borderClass,
        violationBorder,
        highlightClass,
        // Pinned: subtle ring
        isPinned && 'ring-2 ring-blue-400/50 dark:ring-blue-500/40',
        // Past cards are visually muted
        isPast && 'opacity-70',
        // Palette: dim cards with unmet prereqs
        prereqDimmed && 'opacity-50',
        // Subtle hover unless past
        !isPast && 'hover:shadow-md hover:bg-accent/30 transition-shadow',
        // Drag states
        isDragging && 'opacity-50',
        isDragOverlay && 'shadow-xl rotate-1 scale-105 cursor-grabbing',
        !isDragOverlay && !isPast && 'cursor-pointer',
        isPast && 'cursor-pointer',
        'select-none group'
      )}
      title={`${courseId} — ${title} (${credits} cr)`}
    >
      <div className="px-2 py-1.5">
        {/* Top row: course ID + GPA badge */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-foreground leading-tight">
            {courseId}
          </span>

          <div className="flex items-center gap-1 shrink-0">
            {/* Past: letter grade pill */}
            {isPast && letterGrade && (
              <span className="text-[10px] font-bold px-1 rounded bg-muted text-muted-foreground">
                {letterGrade}
              </span>
            )}

            {/* GPA badge */}
            {avgGpa !== null && (
              <span
                className={cn(
                  'text-[10px] font-bold px-1 rounded text-white leading-tight',
                  gpaBgClass
                )}
                title={`Avg GPA: ${avgGpa.toFixed(2)}`}
              >
                {avgGpa.toFixed(1)}
              </span>
            )}
          </div>
        </div>

        {/* Course title — truncated */}
        <p
          className={cn(
            'text-[11px] leading-tight mt-0.5 line-clamp-2',
            isPast ? 'text-muted-foreground' : 'text-muted-foreground/80'
          )}
        >
          {title}
        </p>
      </div>

      {/* Past: checkmark overlay */}
      {isPast && (
        <span
          className="absolute top-1 right-1 text-[10px] text-green-600 dark:text-green-400 font-bold"
          aria-label="Completed"
        >
          ✓
        </span>
      )}

      {/* Pin button — visible on hover or when pinned (timeline only, non-past) */}
      {!isPalette && !isPast && onTogglePin && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePin(courseId); }}
          className={cn(
            'absolute top-0.5 right-0.5 p-0.5 rounded transition-opacity',
            isPinned
              ? 'opacity-100 text-blue-500 dark:text-blue-400'
              : 'opacity-0 group-hover:opacity-60 text-muted-foreground hover:text-blue-500'
          )}
          title={isPinned ? 'Unpin course' : 'Pin course (hold position in auto-plan)'}
          aria-label={isPinned ? 'Unpin' : 'Pin'}
        >
          {isPinned ? <Pin className="h-3 w-3 fill-current" /> : <PinOff className="h-3 w-3" />}
        </button>
      )}

      {/* Prereq warning icon */}
      {violation && (
        <span className={cn(
          "absolute bottom-1 right-1 text-[10px] font-bold",
          isPrereqViolation ? "text-red-500" : "text-amber-500"
        )}>
          ⚠
        </span>
      )}

      {/* Palette: prereq lock icon */}
      {prereqDimmed && (
        <span
          className="absolute bottom-1 left-1 text-[9px] text-amber-500"
          aria-label="Prerequisites not met"
          title="Prerequisites not met"
        >
          🔒
        </span>
      )}
    </div>
  );

  return (
    <>
      {violation ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {cardContent}
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <div className="space-y-2">
              {violation.missingPrereqs.length > 0 && (
                <div className="space-y-1">
                  <p className="font-semibold text-[11px] text-red-500 uppercase tracking-wider">
                    Missing Prerequisites:
                  </p>
                  {violation.missingPrereqs.map((p) => (
                    <p key={p} className="text-[11px] leading-tight flex gap-1.5">
                      <span className="shrink-0">•</span> {p} must be completed in an earlier semester
                    </p>
                  ))}
                </div>
              )}
              {violation.unsatisfiedCoreqs.length > 0 && (
                <div className="space-y-1">
                  <p className="font-semibold text-[11px] text-amber-600 uppercase tracking-wider">
                    Unsatisfied Corequisites:
                  </p>
                  {violation.unsatisfiedCoreqs.map((c) => (
                    <p key={c} className="text-[11px] leading-tight flex gap-1.5">
                      <span className="shrink-0">•</span> {c} must be taken in the same or earlier semester
                    </p>
                  ))}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      ) : (
        cardContent
      )}

      <CourseDetailDialog
        courseId={courseId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        catalog={catalog}
        gradeDistributions={gradeDistributions}
        prereqNodes={prereqNodes}
      />
    </>
  );
}
