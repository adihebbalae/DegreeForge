import { useMemo } from 'react';
import { useSemesters, usePlan } from '@/context/PlanContext';
import {
  useUserProfile,
  useCatalogRecord,
  usePrereqGraph,
  useGradeDistributions,
  useDataLoading,
} from '@/context/DataContext';
import SemesterColumn from './SemesterColumn';
import type { PrereqNode } from '@/types';

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimelineGrid() {
  const semesters = useSemesters();
  const plan = usePlan();
  const userProfile = useUserProfile();
  const catalog = useCatalogRecord();
  const prereqGraph = usePrereqGraph();
  const gradeDistributions = useGradeDistributions();
  const loading = useDataLoading();

  // Build a map: courseId → letter grade from the user profile
  const gradeMap = useMemo<Record<string, string>>(() => {
    if (!userProfile) return {};
    const map: Record<string, string> = {};
    for (const completed of userProfile.completed_courses) {
      map[completed.course] = completed.grade;
    }
    return map;
  }, [userProfile]);

  // Extract prereq nodes for category inference
  const prereqNodes: Record<string, PrereqNode> = useMemo(
    () => prereqGraph?.nodes ?? {},
    [prereqGraph]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading course data…
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-auto">
      {/* Horizontal scrollable row of semester columns */}
      <div className="flex gap-3 p-3 min-h-full">
        {semesters.map((semester) => {
          const courseIds = plan[semester.id] ?? [];

          return (
            <SemesterColumn
              key={semester.id}
              semester={semester}
              courseIds={courseIds}
              gradeMap={gradeMap}
              catalog={catalog}
              prereqNodes={prereqNodes}
              gradeDistributions={gradeDistributions}
            />
          );
        })}
      </div>
    </div>
  );
}
