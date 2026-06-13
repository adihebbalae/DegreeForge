/**
 * HomeMinimalist — the "minimalist-shell" home variant (design Direction 3).
 *
 * Mobile-first. The plan canvas is the whole screen; all other tools live behind
 * a single "≡" menu. A thin top bar carries only the logo, the Fastest/Easiest
 * control, and that menu.
 *
 * Responsive strategy (375 → 1280):
 *   - <md (375–767): single-column MobilePlanList — years stacked vertically,
 *     full-width touch cards (≥44px), 14–16px text, vertical scroll. Tapping a
 *     card opens SemesterSheet as a bottom-sheet.
 *   - md+ (768+): the existing dense OverviewYearGrid (a real grid) fills the
 *     canvas; tapping a tile opens SemesterSheet as a right side-sheet.
 *
 * It takes no props and reads context exactly like PlannerPage (the DnD wiring is
 * shared with that page so the sheet's SemesterColumn editing behaves identically).
 * It does NOT touch the solver, server, or shared Header/OptimizeStrip.
 */

import { useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Notice } from '@/components/ui/notice';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PlannerErrorBoundary, RecoverableErrorBoundary } from '@/components/PlannerErrorBoundary';
import CourseCard from '@/components/CourseCard';
import CoursePalette from '@/components/CoursePalette';
import ChatPanel from '@/components/ChatPanel';
import WhatIfPanel from '@/components/WhatIfPanel';
import CommandPalette from '@/components/CommandPalette';
import OverviewYearGrid from '@/components/OverviewYearGrid';
import PlanOptimizeControl from '@/components/PlanOptimizeControl';
import { PlanComparisonPanel } from '@/components/PlanComparison';
import {
  useCatalogRecord,
  usePrereqGraph as useRawPrereqGraph,
  useGradeDistributions,
} from '@/context/DataContext';
import { usePlanDispatch, usePlan } from '@/context/PlanContext';
import { useUi } from '@/context/UiContext';
import { useRecommendPlan } from '@/hooks/useRecommendPlan';
import { track } from '@/lib/analytics';
import type { PrereqNode } from '@/types';
import MobilePlanList from './MobilePlanList';
import SemesterSheet from './SemesterSheet';
import MinimalistMenu from './MinimalistMenu';
import { usePlanIO } from './usePlanIO';

interface ActiveCardInfo {
  courseId: string;
  source: 'palette' | 'timeline';
  semesterId?: string;
  semesterStatus?: 'past' | 'current' | 'future';
}

export default function HomeMinimalist() {
  const {
    chatOpen, setChatOpen,
    whatIfOpen, setWhatIfOpen,
    paletteOpen, setPaletteOpen,
    focusedSemesterId, setFocusedSemesterId,
  } = useUi();

  const [activeCard, setActiveCard] = useState<ActiveCardInfo | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const dispatch = usePlanDispatch();
  const plan = usePlan();
  const catalog = useCatalogRecord();
  const rawPrereqGraph = useRawPrereqGraph();
  const gradeDistributions = useGradeDistributions();
  const prereqNodes: Record<string, PrereqNode> = rawPrereqGraph?.nodes ?? {};

  const { handleRecommendPlan, noticeProps, confirmProps } = useRecommendPlan();
  const planIO = usePlanIO();

  const handleTileClick = useCallback(
    (semesterId: string) => {
      setFocusedSemesterId(focusedSemesterId === semesterId ? null : semesterId);
    },
    [focusedSemesterId, setFocusedSemesterId],
  );

  const closeSheet = useCallback(() => setFocusedSemesterId(null), [setFocusedSemesterId]);

  // ── DnD sensors + handlers (shared model with PlannerPage) ──────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === 'course') {
      setActiveCard({
        courseId: data.courseId as string,
        source: data.source as 'palette' | 'timeline',
        semesterId: data.semesterId as string | undefined,
        semesterStatus: (data.semesterStatus as 'past' | 'current' | 'future') ?? 'future',
      });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over) return;

    const activeData = active.data.current;
    if (!activeData || activeData.type !== 'course') return;

    const courseId = activeData.courseId as string;
    const source = activeData.source as 'palette' | 'timeline';
    const fromSemester = activeData.semesterId as string | undefined;

    if (over.id === 'palette') {
      if (source === 'timeline' && fromSemester) {
        dispatch({ type: 'REMOVE_COURSE', semesterId: fromSemester, courseId });
      }
      return;
    }

    const overData = over.data.current;
    let toSemester: string | null = null;
    if (overData?.type === 'semester') {
      toSemester = overData.semesterId as string;
    } else if (overData?.type === 'course' && overData?.source === 'timeline') {
      toSemester = overData.semesterId as string;
    }
    if (!toSemester) return;

    if (source === 'palette') {
      const allPlaced = Object.values(plan).flat();
      if (allPlaced.includes(courseId)) return;
      dispatch({ type: 'ADD_COURSE', semesterId: toSemester, courseId });
      track('course_added', { via: 'drag' });
      setFocusedSemesterId(toSemester);
      return;
    }

    if (source === 'timeline' && fromSemester && fromSemester !== toSemester) {
      dispatch({ type: 'MOVE_COURSE', fromSemesterId: fromSemester, toSemesterId: toSemester, courseId });
      return;
    }

    if (source === 'timeline' && fromSemester && fromSemester === toSemester) {
      if (overData?.type === 'course' && overData?.courseId !== courseId) {
        const currentCourses = plan[fromSemester] ?? [];
        const oldIndex = currentCourses.indexOf(courseId);
        const newIndex = currentCourses.indexOf(overData.courseId as string);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          dispatch({
            type: 'REORDER_SEMESTER',
            semesterId: fromSemester,
            courseIds: arrayMove(currentCourses, oldIndex, newIndex),
          });
        }
      }
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <PlannerErrorBoundary>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="h-full flex flex-col relative overflow-hidden bg-background">

          {/* ── Thin top bar: logo · Fastest/Easiest · ≡ ─────────────────────── */}
          <header
            className="h-12 shrink-0 border-b border-border flex items-center gap-2 px-3"
            data-testid="minimalist-topbar"
          >
            <NavLink
              to="/"
              className="text-base font-bold text-foreground rounded-sm hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
              aria-label="DegreeForge home"
            >
              DegreeForge
            </NavLink>

            {/* Fastest/Easiest control. The full readout shows on wider screens;
                the toggle itself stays usable at 375px. */}
            <div className="flex-1 min-w-0 flex justify-center overflow-hidden">
              <PlanOptimizeControl />
            </div>

            <MinimalistMenu
              onRecommend={handleRecommendPlan}
              planIO={planIO}
              onOpenHelp={() => setHelpOpen(true)}
            />
          </header>

          {/* ── Recommend notice / import error strip ────────────────────────── */}
          {planIO.importError && (
            <div className="px-3 py-2 border-b border-border">
              <Notice
                variant="error"
                message={
                  planIO.importError === 'invalid-format'
                    ? 'The file does not contain a valid DegreeForge plan.'
                    : 'The file could not be parsed as JSON.'
                }
                action={{ label: 'Try again', onClick: () => { planIO.clearImportError(); planIO.openImport(); } }}
                onDismiss={planIO.clearImportError}
              />
            </div>
          )}
          {noticeProps && (
            <div className="px-3 py-2 border-b border-border">
              <Notice {...noticeProps} />
            </div>
          )}

          {/* ── Plan canvas — fills the viewport ─────────────────────────────── */}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <PlanComparisonPanel />

            {/* Mobile (<md): vertical single-column list. */}
            <div className="md:hidden h-full">
              <MobilePlanList focusedSemesterId={focusedSemesterId} onTileClick={handleTileClick} />
            </div>

            {/* Desktop (md+): the dense year grid. */}
            <div className="hidden md:block h-full">
              <OverviewYearGrid focusedSemesterId={focusedSemesterId} onTileClick={handleTileClick} />
            </div>
          </div>

          {/* ── Semester editor sheet (bottom-sheet mobile / side-sheet desktop) ── */}
          <SemesterSheet focusedSemesterId={focusedSemesterId} onClose={closeSheet} />

          {/* ── Chat slide-in panel ──────────────────────────────────────────── */}
          <aside
            className={[
              'fixed inset-y-0 right-0 w-full sm:w-80',
              'bg-background border-l border-border shadow-lg',
              'flex flex-col transition-transform duration-300 ease-in-out z-40',
              chatOpen ? 'translate-x-0' : 'translate-x-full invisible pointer-events-none',
            ].join(' ')}
            aria-label="AI chat panel"
            aria-hidden={!chatOpen}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-medium">AI Chat</span>
              <Button variant="ghost" size="icon" onClick={() => setChatOpen(false)} aria-label="Close chat">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <RecoverableErrorBoundary label="chat panel">
                <ChatPanel />
              </RecoverableErrorBoundary>
            </div>
          </aside>

          {/* ── What-If slide-in panel ───────────────────────────────────────── */}
          <aside
            className={[
              'fixed inset-y-0 right-0 w-full sm:w-80',
              'bg-background border-l border-border shadow-lg',
              'flex flex-col transition-transform duration-300 ease-in-out z-40',
              whatIfOpen ? 'translate-x-0' : 'translate-x-full invisible pointer-events-none',
            ].join(' ')}
            aria-label="What-If simulator panel"
            aria-hidden={!whatIfOpen}
          >
            <RecoverableErrorBoundary label="what-if panel">
              <WhatIfPanel onClose={() => setWhatIfOpen(false)} />
            </RecoverableErrorBoundary>
          </aside>

          {/* ── Course palette slide-in drawer ───────────────────────────────── */}
          <aside
            className={[
              'fixed inset-y-0 right-0 w-full sm:w-72',
              'bg-background border-l border-border shadow-lg',
              'flex flex-col transition-transform duration-300 ease-in-out z-40',
              paletteOpen ? 'translate-x-0' : 'translate-x-full invisible pointer-events-none',
            ].join(' ')}
            aria-label="Course palette"
            aria-hidden={!paletteOpen}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-sm font-medium">Courses</span>
              <Button variant="ghost" size="icon" onClick={() => setPaletteOpen(false)} aria-label="Close course palette">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <CoursePalette />
            </div>
          </aside>

          {/* Hidden file input for Import (driven by usePlanIO). */}
          <input
            type="file"
            ref={planIO.fileInputRef}
            className="hidden"
            accept=".json"
            onChange={planIO.handleImportFile}
          />
        </div>

        {/* ── Command palette — Cmd/Ctrl+K ─────────────────────────────────── */}
        <CommandPalette />

        {/* ── Recommend confirm dialog ─────────────────────────────────────── */}
        {confirmProps && <ConfirmDialog {...confirmProps} />}

        {/* ── Help dialog (mitigates discovery loss behind the ≡ menu) ──────── */}
        <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Where everything lives</DialogTitle>
              <DialogDescription>
                This is the minimalist planner. The grid is your plan.
              </DialogDescription>
            </DialogHeader>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li><strong className="text-foreground">Tap a semester</strong> to view and edit its courses.</li>
              <li><strong className="text-foreground">Fastest / Easiest</strong> (top bar) sets what Recommend optimises for.</li>
              <li><strong className="text-foreground">≡ menu</strong> holds Chat, What-If, the course palette, Recommend, Compare, Schedule, Settings, and Export/Import.</li>
              <li><strong className="text-foreground">Cmd/Ctrl+K</strong> quickly adds a course to the open semester.</li>
            </ul>
          </DialogContent>
        </Dialog>

        {/* ── Drag overlay ─────────────────────────────────────────────────── */}
        <DragOverlay dropAnimation={null}>
          {activeCard && (
            <CourseCard
              courseId={activeCard.courseId}
              semesterStatus={activeCard.semesterStatus ?? 'future'}
              catalog={catalog}
              prereqNodes={prereqNodes}
              gradeDistributions={gradeDistributions}
              isDragOverlay
            />
          )}
        </DragOverlay>
      </DndContext>
    </PlannerErrorBoundary>
  );
}
