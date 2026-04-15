import { useMemo } from 'react';
import { useSemesters, usePlan, useHoveredCourse } from '@/context/PlanContext';
import {
  useUserProfile,
  useCatalogRecord,
  usePrereqGraph as useRawPrereqGraph,
  useGradeDistributions,
  useDataLoading,
} from '@/context/DataContext';
import SemesterColumn from './SemesterColumn';
import type { PrereqNode } from '@/types';
import { useValidation } from '@/hooks/useValidation';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimelineGrid() {
  const semesters = useSemesters();
  const plan = usePlan();
  const userProfile = useUserProfile();
  const catalog = useCatalogRecord();
  const rawPrereqGraph = useRawPrereqGraph();
  const gradeDistributions = useGradeDistributions();
  const loading = useDataLoading();

  // TASK-010: Validation and highlighting
  const { violationsByCourse } = useValidation();
  const hoveredCourse = useHoveredCourse();
  const prereqGraph = usePrereqGraph();

  const downstreamCourses = useMemo(() => {
    if (!hoveredCourse) return new Set<string>();
    const deps = prereqGraph.getDownstream(hoveredCourse);
    return new Set([hoveredCourse, ...deps]);
  }, [hoveredCourse, prereqGraph]);

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
    () => rawPrereqGraph?.nodes ?? {},
    [rawPrereqGraph]
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
              violationsByCourse={violationsByCourse}
              downstreamCourses={downstreamCourses}
            />
          );
        })}
      </div>
    </div>
  );
}
