/**
 * FocusEditor — TASK-094 redesign
 *
 * Shows only the focused semester (no neighbor), expanded to the left region,
 * with a right-hand context panel. The right panel is a single tab strip
 * (Insights | Add | Best Path) rendered by FocusTabbedPanel.
 *
 * Kept from original: header ‹ › prev/next nav, Esc-to-close (in PlannerPage),
 * and the "+ Add course" button (selects the Add tab in the tab strip).
 */

import { useMemo, useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUi } from '@/context/UiContext';
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
  useOfferingSchedule,
  useSectionsIndex,
} from '@/context/DataContext';
import SemesterColumn from './SemesterColumn';
import { buildTermLoadCredits, getCourseCredits } from '@/lib/course-utils';
import {
  buildVerifiedTermSet,
  isUnverifiedOfferingPlacement,
} from '@/lib/offering-verification';
import { getCreditHourCap } from '@/lib/auto-planner';
import { useValidation } from '@/hooks/useValidation';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import FocusTabbedPanel, { FocusTabStrip, type FocusTab } from './focus/FocusTabbedPanel';
import type { PrereqNode } from '@/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface FocusEditorProps {
  focusedSemesterId: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FocusEditor({ focusedSemesterId, onClose }: FocusEditorProps) {
  // The single tab strip defaults to Insights; the "+ Add course" button jumps to Add.
  const [activeTab, setActiveTab] = useState<FocusTab>('insights');
  const semesters = useSemesters();
  const { setFocusedSemesterId } = useUi();
  const plan = usePlan();
  const userProfile = useUserProfile();
  const effectiveProfile = useEffectiveProfile();
  const catalog = useCatalogRecord();
  const rawPrereqGraph = useRawPrereqGraph();
  const gradeDistributions = useGradeDistributions();
  const offeringSchedule = useOfferingSchedule();
  const sectionsIndex = useSectionsIndex();
  const dispatch = usePlanDispatch();

  const verifiedTerms = useMemo(
    () => buildVerifiedTermSet(sectionsIndex),
    [sectionsIndex]
  );

  const creditHourCap = getCreditHourCap(effectiveProfile);

  const { violationsByCourse } = useValidation();
  const hoveredCourse = useHoveredCourse();
  const prereqGraph = usePrereqGraph();
  const gradeEntries = useGradeEntries();
  const pinnedCourses = usePinnedCourses();
  const ghostCourses = useGhostCourses();

  const prereqNodes: Record<string, PrereqNode> = rawPrereqGraph?.nodes ?? {};

  const transcriptCredits = useMemo(
    () => buildTermLoadCredits(userProfile),
    [userProfile]
  );

  // Total credits for the focused semester — surfaced in the header since the
  // SemesterColumn's own header (which normally shows this) is suppressed below.
  const focusedCredits = useMemo(
    () =>
      (plan[focusedSemesterId] ?? []).reduce(
        (sum, courseId) => sum + getCourseCredits(courseId, catalog, transcriptCredits),
        0
      ),
    [plan, focusedSemesterId, catalog, transcriptCredits]
  );

  const downstreamCourses = useMemo(() => {
    if (!hoveredCourse) return new Set<string>();
    return new Set([hoveredCourse, ...prereqGraph.getDownstream(hoveredCourse)]);
  }, [hoveredCourse, prereqGraph]);

  const upstreamCourses = useMemo(() => {
    if (!hoveredCourse) return new Set<string>();
    return new Set(prereqGraph.getAllPrereqs(hoveredCourse));
  }, [hoveredCourse, prereqGraph]);

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

  // ── Find focused semester ────────────────────────────────────────────────────
  const focusedIdx = semesters.findIndex((s) => s.id === focusedSemesterId);
  const focusedSem = semesters[focusedIdx];

  // Adjacent semesters for prev/next nav.
  const prevSem = focusedIdx > 0 ? semesters[focusedIdx - 1] : null;
  const nextSem = focusedIdx >= 0 && focusedIdx < semesters.length - 1
    ? semesters[focusedIdx + 1]
    : null;

  if (!focusedSem) return null;

  return (
    <div className="h-full flex flex-col min-h-0">

      {/* ── Focus header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0 flex-wrap">
        {/* Back to overview */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 gap-1 text-xs shrink-0"
          onClick={onClose}
          aria-label="Back to overview"
        >
          <ChevronLeft className="h-3 w-3" />
          Overview
        </Button>

        {/* Focused semester label + credit-hours (credit-hours surfaced here since
            SemesterColumn's own header is suppressed via hideHeader below). */}
        <span className="text-sm font-medium text-foreground shrink-0">
          {focusedSem.label}
        </span>
        <span className="text-[11px] text-muted-foreground shrink-0" data-testid="focus-editor-credits">
          {focusedSem.status === 'past'
            ? `${focusedCredits} hrs`
            : `${focusedCredits} / ${creditHourCap} hrs`}
        </span>

        {/* Prev/next semester nav */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => prevSem && setFocusedSemesterId(prevSem.id)}
            disabled={!prevSem}
            title={prevSem ? `Previous: ${prevSem.label}` : 'No earlier semester'}
            aria-label="Previous semester"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => nextSem && setFocusedSemesterId(nextSem.id)}
            disabled={!nextSem}
            title={nextSem ? `Next: ${nextSem.label}` : 'No later semester'}
            aria-label="Next semester"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Esc hint */}
        <span className="text-xs text-muted-foreground hidden sm:inline">Press Esc to close</span>

        {/* Inline segmented tab strip (Insights · Add · Best Path) — drives the
            headless FocusTabbedPanel below. Pushed right with the Add button. */}
        <FocusTabStrip
          activeTab={activeTab}
          onSelect={setActiveTab}
          variant="segmented"
          className="ml-auto shrink-0"
        />

        {/* + Add course — jumps to the Add tab in the tab strip */}
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 gap-1 text-xs shrink-0"
          onClick={() => setActiveTab('add')}
          aria-label="Add course to semester"
          data-testid="focus-editor-add-course-btn"
        >
          <Plus className="h-3 w-3" />
          Add course
        </Button>
      </div>

      {/* ── Body: semester column + right panel ──────────────────────────────── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Left: focused semester column. w-80 wrapper (slightly wider than the
            old w-72) gives the full-width cards more reading room without starving
            the flex-1 Insights panel on the right. */}
        <div className="w-80 shrink-0 overflow-y-auto p-3">
          <SemesterColumn
            semester={focusedSem}
            courseIds={plan[focusedSem.id] ?? []}
            gradeMap={gradeMap}
            catalog={catalog}
            prereqNodes={prereqNodes}
            gradeDistributions={gradeDistributions}
            transcriptCredits={transcriptCredits}
            violationsByCourse={violationsByCourse}
            unverifiedOfferingCourses={
              new Set(
                (plan[focusedSem.id] ?? []).filter((courseId) =>
                  isUnverifiedOfferingPlacement(courseId, focusedSem, offeringSchedule, verifiedTerms)
                )
              )
            }
            downstreamCourses={downstreamCourses}
            upstreamCourses={upstreamCourses}
            pinnedCourses={pinnedCourses}
            onTogglePin={handleTogglePin}
            ghostCourseIds={ghostCourses[focusedSem.id] ?? []}
            onAcceptGhost={handleAcceptGhost}
            onRejectGhost={handleRejectGhost}
            creditHourCap={creditHourCap}
            hideHeader
            controlsLayout="side"
            fullWidth
          />
        </div>

        {/* Right: active panel content (headless — tabs live in the header above) */}
        <div className="flex-1 min-w-0 border-l border-border overflow-hidden min-h-0 flex flex-col">
          <FocusTabbedPanel
            semester={focusedSem}
            creditHourCap={creditHourCap}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            headless
          />
        </div>
      </div>
    </div>
  );
}
