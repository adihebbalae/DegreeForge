/**
 * CoursePickerSheet — inline tap-to-add picker for mobile (TASK-086).
 *
 * Renders as an expanding search section (no extra overlay) so it works
 * comfortably inside the existing SemesterSheet bottom-sheet at 390×844.
 *
 * Add path: dispatches ADD_COURSE to the provided semesterId.
 * Guards (past-term write, duplicate) live in the reducer — this component
 * surfaces user-visible feedback for the two guard cases, but does NOT
 * duplicate the rule logic.
 *
 * Analytics: fires track('course_added', { via: 'tap' }) on success.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Search, PlusCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useCatalogRecord,
  usePrereqGraph as useRawPrereqGraph,
  useUserProfile,
} from '@/context/DataContext';
import { usePlan, useSemesters, usePlanDispatch } from '@/context/PlanContext';
import { isPastSemester } from '@/lib/sanitize-course-list';
import { getCourseTitle, inferCategory } from '@/lib/course-utils';
import { isCourseSatisfied } from '@/lib/palette-courses';
import { track } from '@/lib/analytics';
import type { CourseCategory } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CourseMatch {
  id: string;
  title: string;
  category: CourseCategory;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<CourseCategory, string> = {
  ece_core: 'ECE Core',
  tech_core: 'Tech Core',
  gen_ed: 'Gen Ed',
  elective: 'Elective',
  math: 'Math',
};

const CATEGORY_TEXT: Record<CourseCategory, string> = {
  ece_core: 'text-blue-600 dark:text-blue-400',
  tech_core: 'text-green-600 dark:text-green-400',
  gen_ed: 'text-amber-600 dark:text-amber-400',
  elective: 'text-muted-foreground',
  math: 'text-purple-600 dark:text-purple-400',
};

const CATEGORY_BORDER: Record<CourseCategory, string> = {
  ece_core: 'border-l-4 border-blue-500',
  tech_core: 'border-l-4 border-green-500',
  gen_ed: 'border-l-4 border-amber-500',
  elective: 'border-l-4 border-border',
  math: 'border-l-4 border-purple-500',
};

const MAX_RESULTS = 30;

// ─── Props ────────────────────────────────────────────────────────────────────

interface CoursePickerSheetProps {
  /** The semester to add courses to. */
  semesterId: string;
  /** Called when the picker should close (user taps X or adds a course). */
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CoursePickerSheet({ semesterId, onClose }: CoursePickerSheetProps) {
  const [query, setQuery] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const catalog = useCatalogRecord();
  const rawPrereqGraph = useRawPrereqGraph();
  const userProfile = useUserProfile();
  const plan = usePlan();
  const semesters = useSemesters();
  const dispatch = usePlanDispatch();

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input when the picker opens.
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Courses already placed, completed, or in-progress — excluded from results.
  const excludedSet = useMemo(() => {
    const placed = new Set<string>(Object.values(plan).flat());
    const completed = new Set<string>(
      (userProfile?.completed_courses ?? []).map((c) => c.course)
    );
    const inProgress = new Set<string>(
      (userProfile?.in_progress_courses ?? []).map((c) => c.course)
    );
    return new Set([...placed, ...completed, ...inProgress]);
  }, [plan, userProfile]);

  const results = useMemo<CourseMatch[]>(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    const prereqNodes = rawPrereqGraph?.nodes ?? {};

    const matches: CourseMatch[] = [];
    for (const [id, course] of Object.entries(catalog)) {
      if (isCourseSatisfied(id, excludedSet)) continue;

      if (q) {
        const codeMatch = id.toLowerCase().includes(q);
        const titleMatch = course.title.toLowerCase().includes(q);
        if (!codeMatch && !titleMatch) continue;
      }

      matches.push({
        id,
        title: getCourseTitle(id, catalog, prereqNodes),
        category: inferCategory(id, prereqNodes),
      });

      if (matches.length >= MAX_RESULTS) break;
    }
    return matches;
  }, [catalog, rawPrereqGraph, query, excludedSet]);

  const semesterLabel = useMemo(() => {
    return semesters.find((s) => s.id === semesterId)?.label ?? semesterId;
  }, [semesters, semesterId]);

  const handleAdd = useCallback(
    (courseId: string) => {
      // UI-layer guard: surface a human-readable message for the past-term case.
      // The reducer enforces the same invariant and will silently reject if the
      // message is somehow bypassed.
      if (isPastSemester(semesterId, semesters)) {
        setFeedbackMsg(`Cannot add to ${semesterLabel} — it's already past.`);
        return;
      }
      dispatch({ type: 'ADD_COURSE', semesterId, courseId });
      track('course_added', { via: 'tap' });
      // Clear query so the user can add another course immediately.
      setQuery('');
      setFeedbackMsg(null);
    },
    [semesterId, semesters, semesterLabel, dispatch]
  );

  return (
    <div
      data-testid="course-picker-sheet"
      className="flex flex-col border-t border-border bg-card"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setFeedbackMsg(null);
          }}
          placeholder="Search course code or title…"
          aria-label="Search courses to add"
          className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
          aria-label="Close course search"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Feedback message (past-term guard) */}
      {feedbackMsg && (
        <div className="px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400 border-b border-border bg-amber-50 dark:bg-amber-900/20">
          {feedbackMsg}
        </div>
      )}

      {/* Results list — scrollable, capped height to fit inside the sheet */}
      <ul
        role="listbox"
        aria-label={`Courses to add to ${semesterLabel}`}
        className="overflow-y-auto max-h-[40dvh]"
      >
        {results.length === 0 && (
          <li
            role="option"
            aria-selected={false}
            className="px-4 py-6 text-center text-sm text-muted-foreground"
          >
            {query.trim()
              ? 'No courses match your search.'
              : 'All courses are already in your plan.'}
          </li>
        )}

        {results.map((course) => (
          <li
            key={course.id}
            role="option"
            aria-selected={false}
            className={[
              'flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none',
              'active:bg-accent',
              'hover:bg-muted/50',
              CATEGORY_BORDER[course.category],
            ].join(' ')}
            onPointerDown={(e) => {
              // pointerdown fires on both mouse and touch.
              // Prevent the search input from blurring.
              e.preventDefault();
              handleAdd(course.id);
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium tabular-nums shrink-0 text-foreground">
                  {course.id}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {course.title}
                </span>
              </div>
            </div>

            <span className={['text-[10px] font-medium shrink-0', CATEGORY_TEXT[course.category]].join(' ')}>
              {CATEGORY_LABEL[course.category]}
            </span>

            <PlusCircle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
          </li>
        ))}
      </ul>

      {/* Footer: result count */}
      <div className="px-3 py-1.5 border-t border-border shrink-0">
        <span className="text-[11px] text-muted-foreground">
          {results.length} result{results.length !== 1 ? 's' : ''}
          {' · '}adding to {semesterLabel}
        </span>
      </div>
    </div>
  );
}
