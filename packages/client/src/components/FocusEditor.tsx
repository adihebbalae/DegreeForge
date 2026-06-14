/**
 * FocusEditor — TASK-094 redesign
 *
 * Shows only the focused semester (no neighbor), expanded to the left region,
 * with a right-hand context panel. A compact segmented switcher in the header
 * flips the right panel between three layouts: Insights | Add | Tabbed.
 * The choice persists via UiContext → localStorage.
 *
 * Kept from original: header ‹ › prev/next nav, Esc-to-close (in PlannerPage),
 * and the "+ Add course" button (wires to the inline picker in the Add panel
 * when Add or Tabbed is selected; opens a standalone picker otherwise).
 */

import { useMemo, useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useUi, type FocusLayout } from '@/context/UiContext';
import CoursePickerSheet from '@/components/CoursePickerSheet';
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
import { buildTermLoadCredits } from '@/lib/course-utils';
import {
  buildVerifiedTermSet,
  isUnverifiedOfferingPlacement,
} from '@/lib/offering-verification';
import { getCreditHourCap } from '@/lib/auto-planner';
import { useValidation } from '@/hooks/useValidation';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import FocusInsightsPanel from './focus/FocusInsightsPanel';
import FocusAddPanel from './focus/FocusAddPanel';
import FocusTabbedPanel from './focus/FocusTabbedPanel';
import type { PrereqNode } from '@/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface FocusEditorProps {
  focusedSemesterId: string;
  onClose: () => void;
}

// ─── Layout switcher labels ───────────────────────────────────────────────────

const LAYOUT_OPTIONS: Array<{ id: FocusLayout; label: string }> = [
  { id: 'insights', label: 'Insights' },
  { id: 'add', label: 'Add' },
  { id: 'tabbed', label: 'Tabbed' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function FocusEditor({ focusedSemesterId, onClose }: FocusEditorProps) {
  // pickerOpen is only used when layout = 'insights' (the Add panel is always-open
  // in 'add' layout; the Tabbed panel has its own Add tab).
  const [pickerOpen, setPickerOpen] = useState(false);
  const semesters = useSemesters();
  const { setFocusedSemesterId, focusLayout, setFocusLayout } = useUi();
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

  // The "+ Add course" button opens the standalone picker only when layout is
  // 'insights' (the other two already embed an always-open picker).
  const handleAddCourse = () => {
    if (focusLayout === 'insights') {
      setPickerOpen((v) => !v);
    } else {
      // Switch to the Add layout so the picker becomes visible immediately.
      setFocusLayout('add');
    }
  };

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

        {/* Focused semester label */}
        <span className="text-sm font-medium text-foreground shrink-0">
          {focusedSem.label}
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

        {/* Layout switcher */}
        <div
          className="flex items-center rounded border border-border bg-muted/40 overflow-hidden text-xs shrink-0"
          role="group"
          aria-label="Focus panel layout"
        >
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFocusLayout(opt.id)}
              className={cn(
                'px-2.5 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                focusLayout === opt.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={focusLayout === opt.id}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Esc hint */}
        <span className="text-xs text-muted-foreground hidden sm:inline">Press Esc to close</span>

        {/* + Add course */}
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 gap-1 text-xs shrink-0 ml-auto"
          onClick={handleAddCourse}
          aria-label={
            focusLayout === 'insights'
              ? pickerOpen ? 'Close course search' : 'Add course to semester'
              : 'Open Add panel'
          }
          {...(focusLayout === 'insights' ? { 'aria-expanded': pickerOpen } : {})}
          data-testid="focus-editor-add-course-btn"
        >
          <Plus className="h-3 w-3" />
          Add course
        </Button>
      </div>

      {/* ── Body: semester column + right panel ──────────────────────────────── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Left: focused semester column */}
        <div className="w-72 shrink-0 overflow-y-auto p-3">
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
          />
        </div>

        {/* Right: context panel */}
        <div className="flex-1 min-w-0 border-l border-border overflow-hidden min-h-0 flex flex-col">
          {focusLayout === 'insights' && (
            <FocusInsightsPanel semester={focusedSem} creditHourCap={creditHourCap} />
          )}
          {focusLayout === 'add' && (
            <FocusAddPanel semester={focusedSem} />
          )}
          {focusLayout === 'tabbed' && (
            <FocusTabbedPanel semester={focusedSem} creditHourCap={creditHourCap} />
          )}
        </div>
      </div>

      {/* Standalone picker — only shown when layout = 'insights' and user clicked + Add */}
      {focusLayout === 'insights' && pickerOpen && (
        <CoursePickerSheet
          semesterId={focusedSemesterId}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
