/**
 * FocusEditor — shows the focused semester (and its immediate neighbor) at full
 * detail using existing SemesterColumn components. Displayed in the right 2/3
 * of the planner when a tile is clicked.
 *
 * The neighbor is:
 *  - next semester in list if the focused one is first, else previous semester.
 * This lets the user drag courses between adjacent semesters.
 */

import { useMemo, useCallback } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useSemesters,
  usePlan,
  useHoveredCourse,
  useGradeEntries,
  usePinnedCourses,
  useGhostCourses,
  usePlanDispatch,
} from '@/context/PlanContext';
import {
  useUserProfile,
  useCatalogRecord,
  usePrereqGraph as useRawPrereqGraph,
  useGradeDistributions,
} from '@/context/DataContext';
import SemesterColumn from './SemesterColumn';
import { buildTermLoadCredits } from '@/lib/course-utils';
import { getCreditHourCap } from '@/lib/auto-planner';
import { useValidation } from '@/hooks/useValidation';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import type { PrereqNode } from '@/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface FocusEditorProps {
  focusedSemesterId: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FocusEditor({ focusedSemesterId, onClose }: FocusEditorProps) {
  const semesters = useSemesters();
  const plan = usePlan();
  const userProfile = useUserProfile();
  const effectiveProfile = useEffectiveProfile();
  const catalog = useCatalogRecord();
  const rawPrereqGraph = useRawPrereqGraph();
  const gradeDistributions = useGradeDistributions();
  const dispatch = usePlanDispatch();

  // Derive credit-hour cap from the effective profile (respects Settings tolerance override).
  // Falls back to 17 (normal load) while profile is loading.
  const creditHourCap = getCreditHourCap(effectiveProfile);

  const { violationsByCourse } = useValidation();
  const hoveredCourse = useHoveredCourse();
  const prereqGraph = usePrereqGraph();
  const gradeEntries = useGradeEntries();
  const pinnedCourses = usePinnedCourses();
  const ghostCourses = useGhostCourses();

  const prereqNodes: Record<string, PrereqNode> = rawPrereqGraph?.nodes ?? {};

  // Term-load credits: AP/transfer/credit_by_exam mapped to 0 so they don't
  // inflate the semester's "N/cap hrs" display. Degree progress still counts
  // all sources (handled in progress.ts via buildTranscriptCredits).
  const transcriptCredits = useMemo(
    () => buildTermLoadCredits(userProfile),
    [userProfile]
  );

  // ── Downstream / upstream highlights ────────────────────────────────────────
  const downstreamCourses = useMemo(() => {
    if (!hoveredCourse) return new Set<string>();
    return new Set([hoveredCourse, ...prereqGraph.getDownstream(hoveredCourse)]);
  }, [hoveredCourse, prereqGraph]);

  const upstreamCourses = useMemo(() => {
    if (!hoveredCourse) return new Set<string>();
    return new Set(prereqGraph.getAllPrereqs(hoveredCourse));
  }, [hoveredCourse, prereqGraph]);

  // ── Grade map ───────────────────────────────────────────────────────────────
  const gradeMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (userProfile) {
      for (const c of userProfile.completed_courses) {
        map[c.course] = c.grade;
      }
    }
    for (const semId of Object.keys(gradeEntries)) {
      for (const [courseId, grade] of Object.entries(gradeEntries[semId])) {
        map[courseId] = grade;
      }
    }
    return map;
  }, [userProfile, gradeEntries]);

  // ── Pin handlers ────────────────────────────────────────────────────────────
  const handleTogglePin = useCallback((courseId: string) => {
    if (pinnedCourses.includes(courseId)) {
      dispatch({ type: 'UNPIN_COURSE', courseId });
    } else {
      dispatch({ type: 'PIN_COURSE', courseId });
    }
  }, [pinnedCourses, dispatch]);

  const handleAcceptGhost = useCallback((courseId: string, semesterId: string) => {
    dispatch({ type: 'ACCEPT_GHOST', courseId, semesterId });
  }, [dispatch]);

  const handleRejectGhost = useCallback((courseId: string) => {
    dispatch({ type: 'REJECT_GHOST', courseId });
  }, [dispatch]);

  // ── Find focused + neighbor semesters ───────────────────────────────────────
  const focusedIdx = semesters.findIndex((s) => s.id === focusedSemesterId);
  const focusedSem = semesters[focusedIdx];

  // Neighbor: next if possible, else previous
  const neighborSem = focusedIdx < semesters.length - 1
    ? semesters[focusedIdx + 1]
    : focusedIdx > 0 ? semesters[focusedIdx - 1] : null;

  if (!focusedSem) return null;

  const displaySemesters = neighborSem
    ? [focusedSem, neighborSem]
    : [focusedSem];

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Focus header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 gap-1 text-xs"
          onClick={onClose}
          aria-label="Back to overview"
        >
          <ChevronLeft className="h-3 w-3" />
          Overview
        </Button>
        <span className="text-sm font-medium text-foreground">
          {focusedSem.label}
          {neighborSem && (
            <span className="text-muted-foreground font-normal"> + {neighborSem.label}</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">Press Esc to close</span>
      </div>

      {/* Semester columns */}
      <div className="flex-1 min-h-0 flex gap-3 p-3 overflow-y-auto">
        {displaySemesters.map((sem) => (
          <div key={sem.id} className="shrink-0">
            <SemesterColumn
              semester={sem}
              courseIds={plan[sem.id] ?? []}
              gradeMap={gradeMap}
              catalog={catalog}
              prereqNodes={prereqNodes}
              gradeDistributions={gradeDistributions}
              transcriptCredits={transcriptCredits}
              violationsByCourse={violationsByCourse}
              downstreamCourses={downstreamCourses}
              upstreamCourses={upstreamCourses}
              pinnedCourses={pinnedCourses}
              onTogglePin={handleTogglePin}
              ghostCourseIds={ghostCourses[sem.id] ?? []}
              onAcceptGhost={handleAcceptGhost}
              onRejectGhost={handleRejectGhost}
              creditHourCap={creditHourCap}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
