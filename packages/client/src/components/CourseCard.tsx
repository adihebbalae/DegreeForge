import { cn } from '@/lib/utils';
import { inferCategory, CATEGORY_BORDER, getCourseCredits, getCourseTitle, gpaColorClass } from '@/lib/course-utils';
import type { CourseCatalog, CourseCategory, PrereqNode } from '@/types';

interface CourseCardProps {
  courseId: string;
  /** Status of the semester this card lives in */
  semesterStatus: 'past' | 'current' | 'future';
  /** Actual letter grade earned (past semesters only) */
  letterGrade?: string;
  /** Data from DataContext */
  catalog: CourseCatalog | null;
  prereqNodes: Record<string, PrereqNode>;
  gradeDistributions: Record<string, { avg_gpa: number }>;
  /** Optional: override inferred category */
  categoryOverride?: CourseCategory;
}

export default function CourseCard({
  courseId,
  semesterStatus,
  letterGrade,
  catalog,
  prereqNodes,
  gradeDistributions,
  categoryOverride,
}: CourseCardProps) {
  const category = categoryOverride ?? inferCategory(courseId, prereqNodes);
  const borderClass = CATEGORY_BORDER[category];

  const title = getCourseTitle(courseId, catalog, prereqNodes);
  const credits = getCourseCredits(courseId, catalog, prereqNodes);

  const avgGpa = gradeDistributions[courseId]?.avg_gpa ?? null;
  const gpaBgClass = gpaColorClass(avgGpa);

  const isPast = semesterStatus === 'past';

  return (
    <div
      className={cn(
        'relative rounded-md bg-card shadow-sm overflow-hidden',
        'border border-border',
        borderClass,
        // Past cards are visually muted
        isPast && 'opacity-70',
        // Subtle hover unless past
        !isPast && 'hover:shadow-md hover:bg-accent/30 transition-shadow',
        'cursor-default select-none'
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

      {/* Prereq warning placeholder — TASK-010 will activate */}
      {/* <span className="absolute bottom-1 left-1 text-[10px] text-red-500">⚠</span> */}
    </div>
  );
}
