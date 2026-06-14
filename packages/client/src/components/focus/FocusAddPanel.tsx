/**
 * FocusAddPanel — TASK-094
 *
 * Right-panel "Add" layout for the FocusEditor.
 * Always-open CoursePickerSheet (not a toggle) + "You may also like" suggestions
 * seeded from the focused term's courses, filtered to courses not already in the plan.
 */

import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import CoursePickerSheet from '@/components/CoursePickerSheet';
import { usePlan } from '@/context/PlanContext';
import { useTechCoresRecord, useCatalogRecord } from '@/context/DataContext';
import { getRelatedCourses } from '@/lib/related-courses';
import { getCourseTitle } from '@/lib/course-utils';
import type { Semester } from '@/types';

interface FocusAddPanelProps {
  semester: Semester;
}

export default function FocusAddPanel({ semester }: FocusAddPanelProps) {
  const plan = usePlan();
  const techCores = useTechCoresRecord();
  const catalog = useCatalogRecord();

  const courseIds = plan[semester.id] ?? [];

  // All placed courses across the entire plan (for filtering suggestions).
  const allPlaced = useMemo(
    () => new Set(Object.values(plan).flat()),
    [plan],
  );

  // "You may also like" — related courses seeded from each course in this term,
  // de-duplicated and filtered to courses not yet in the plan.
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ courseId: string; reason: string }> = [];
    for (const id of courseIds) {
      for (const rel of getRelatedCourses(id, techCores)) {
        if (!seen.has(rel.course) && !allPlaced.has(rel.course)) {
          seen.add(rel.course);
          result.push({ courseId: rel.course, reason: rel.reason });
        }
      }
    }
    return result.slice(0, 8);
  }, [courseIds, techCores, allPlaced]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Inline picker — always-open, no close affordance visible */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CoursePickerSheet
          semesterId={semester.id}
          onClose={() => {
            /* no-op: panel is always open; the outer switcher controls visibility */
          }}
        />
      </div>

      {/* "You may also like" */}
      {suggestions.length > 0 && (
        <div className="border-t border-border shrink-0">
          <div className="px-3 py-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              You May Also Like
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-border max-h-40 overflow-y-auto">
            {suggestions.map(({ courseId, reason }) => {
              const title = getCourseTitle(courseId, catalog, {});
              return (
                <li key={courseId} className="px-3 py-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium tabular-nums text-foreground shrink-0">
                      {courseId}
                    </span>
                    {title !== courseId && (
                      <span className="text-[11px] text-muted-foreground truncate">{title}</span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{reason}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
