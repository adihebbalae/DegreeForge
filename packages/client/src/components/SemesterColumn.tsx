import { cn } from '@/lib/utils';
import { getCourseCredits } from '@/lib/course-utils';
import CourseCard from './CourseCard';
import type { Semester, CourseCatalog, PrereqNode, CompletedCourse } from '@/types';

// ─── Empty drop-zone placeholder ──────────────────────────────────────────────
// TASK-008 will replace this with a live droppable surface.

function EmptySlot({ semesterId }: { semesterId: string }) {
  return (
    <div
      data-semester-id={semesterId}
      className={cn(
        'border-2 border-dashed border-gray-300 dark:border-gray-600',
        'rounded-lg p-3 h-16',
        'flex items-center justify-center',
        'text-gray-400 dark:text-gray-500 text-sm'
      )}
    >
      Drop course here
    </div>
  );
}

// ─── Season icon ───────────────────────────────────────────────────────────────

function SeasonIcon({ season }: { season: 'Fall' | 'Spring' | 'Summer' }) {
  if (season === 'Fall') return <span aria-hidden="true">🍂</span>;
  if (season === 'Spring') return <span aria-hidden="true">🌸</span>;
  return <span aria-hidden="true">☀️</span>;
}

// ─── Credit-count color ────────────────────────────────────────────────────────

function creditCountClass(credits: number): string {
  if (credits > 18) return 'text-red-500 font-semibold';
  if (credits === 18) return 'text-yellow-500 font-semibold';
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
  gradeDistributions: Record<string, { avg_gpa: number }>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SemesterColumn({
  semester,
  courseIds,
  gradeMap,
  catalog,
  prereqNodes,
  gradeDistributions,
}: SemesterColumnProps) {
  const { id, label, status, season } = semester;
  const isPast = status === 'past';
  const isCurrent = status === 'current';

  // Compute total credits for the semester
  const totalCredits = courseIds.reduce(
    (sum, courseId) => sum + getCourseCredits(courseId, catalog, prereqNodes),
    0
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-2 min-w-[180px] w-[180px] shrink-0 rounded-lg p-2',
        // Background tint by status
        isPast && 'bg-gray-50 dark:bg-gray-900/50',
        isCurrent && 'bg-background ring-2 ring-blue-500 dark:ring-blue-400',
        !isPast && !isCurrent && 'bg-background'
      )}
    >
      {/* ── Column Header ─────────────────────────────────────────── */}
      <div
        className={cn(
          'flex flex-col gap-0.5 px-1 pb-1 border-b border-border',
          isPast && 'opacity-75'
        )}
      >
        {/* Semester label + season icon + checkmark (past) */}
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
            <span className="text-[10px] bg-blue-500 text-white px-1 rounded font-medium">
              NOW
            </span>
          )}
        </div>

        {/* Credit count */}
        <span className={cn('text-[11px]', creditCountClass(totalCredits))}>
          {totalCredits} / 18 hrs
        </span>
      </div>

      {/* ── Course Cards ──────────────────────────────────────────── */}
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
          />
        ))}
      </div>

      {/* ── Empty drop zones (future semesters) ──────────────────── */}
      {status === 'future' && (
        <div className="flex flex-col gap-1.5 mt-1">
          <EmptySlot semesterId={id} />
        </div>
      )}
    </div>
  );
}
