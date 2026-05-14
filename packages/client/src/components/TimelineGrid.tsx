import { useMemo } from 'react';
import { useSemesters, usePlan, useHoveredCourse, useGradeEntries } from '@/context/PlanContext';
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
import { useEffect, useRef } from 'react';

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
  const gradeEntries = useGradeEntries();

  const downstreamCourses = useMemo(() => {
    if (!hoveredCourse) return new Set<string>();
    const deps = prereqGraph.getDownstream(hoveredCourse);
    return new Set([hoveredCourse, ...deps]);
  }, [hoveredCourse, prereqGraph]);

  // Build a map: courseId → letter grade from the user profile and plan state
  const gradeMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (userProfile) {
      for (const completed of userProfile.completed_courses) {
        map[completed.course] = completed.grade;
      }
    }
    // Merge dynamically entered grades (which override profile if duplicate)
    for (const semId of Object.keys(gradeEntries)) {
      for (const [courseId, grade] of Object.entries(gradeEntries[semId])) {
        map[courseId] = grade;
      }
    }
    return map;
  }, [userProfile, gradeEntries]);

  // Extract prereq nodes for category inference
  const prereqNodes: Record<string, PrereqNode> = useMemo(
    () => rawPrereqGraph?.nodes ?? {},
    [rawPrereqGraph]
  );

  // Feature 2: Auto-scroll to Current Semester
  const currentSemesterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && currentSemesterRef.current) {
      currentSemesterRef.current.scrollIntoView({ inline: 'start', behavior: 'smooth' });
    }
  }, [loading]);

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
            <div key={semester.id} ref={semester.status === 'current' ? currentSemesterRef : null} className="h-full">
              <SemesterColumn
                semester={semester}
                courseIds={courseIds}
                gradeMap={gradeMap}
                catalog={catalog}
                prereqNodes={prereqNodes}
                gradeDistributions={gradeDistributions}
                violationsByCourse={violationsByCourse}
                downstreamCourses={downstreamCourses}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
