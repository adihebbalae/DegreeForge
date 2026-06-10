import { useState, useEffect, useCallback } from 'react';
import { X, BookOpen } from 'lucide-react';
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
import { ProgressBars } from '@/components/ProgressBars';
import { ComparisonToggle, PlanComparisonPanel } from '../components/PlanComparison';
import CoursePalette from '@/components/CoursePalette';
import CourseCard from '@/components/CourseCard';
import ValidationBanner from '@/components/ValidationBanner';
import ChatPanel from '@/components/ChatPanel';
import WhatIfPanel from '@/components/WhatIfPanel';
import OverviewYearGrid from '@/components/OverviewYearGrid';
import FocusEditor from '@/components/FocusEditor';
import {
  useCatalogRecord,
  usePrereqGraph as useRawPrereqGraph,
  useGradeDistributions,
} from '@/context/DataContext';
import { usePlanDispatch, usePlan } from '@/context/PlanContext';
import { useUi } from '@/context/UiContext';
import type { PrereqNode } from '@/types';

// ─── Active card shape ────────────────────────────────────────────────────────

interface ActiveCardInfo {
  courseId: string;
  source: 'palette' | 'timeline';
  semesterId?: string;
  semesterStatus?: 'past' | 'current' | 'future';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlannerPage() {
  const {
    chatOpen, setChatOpen,
    whatIfOpen, setWhatIfOpen,
    paletteOpen, setPaletteOpen,
    focusedSemesterId, setFocusedSemesterId,
  } = useUi();

  const [activeCard, setActiveCard] = useState<ActiveCardInfo | null>(null);

  // ── Dispatch + plan state ─────────────────────────────────────────────────
  const dispatch = usePlanDispatch();
  const plan = usePlan();

  // ── Data for the DragOverlay CourseCard ──────────────────────────────────
  const catalog = useCatalogRecord();
  const rawPrereqGraph = useRawPrereqGraph();
  const gradeDistributions = useGradeDistributions();
  const prereqNodes: Record<string, PrereqNode> = rawPrereqGraph?.nodes ?? {};

  // ── Esc key to close focus ────────────────────────────────────────────────
  useEffect(() => {
    if (!focusedSemesterId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusedSemesterId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [focusedSemesterId, setFocusedSemesterId]);

  // ── Tile click: toggle focus ──────────────────────────────────────────────
  const handleTileClick = useCallback((semesterId: string) => {
    setFocusedSemesterId(focusedSemesterId === semesterId ? null : semesterId);
  }, [focusedSemesterId, setFocusedSemesterId]);

  // ── Sensors ───────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ── Drag handlers ─────────────────────────────────────────────────────────

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

    // ── Drop on palette → remove from plan ──────────────────────────────────
    if (over.id === 'palette') {
      if (source === 'timeline' && fromSemester) {
        dispatch({ type: 'REMOVE_COURSE', semesterId: fromSemester, courseId });
      }
      return;
    }

    // ── Resolve target semester ──────────────────────────────────────────────
    const overData = over.data.current;
    let toSemester: string | null = null;

    if (overData?.type === 'semester') {
      toSemester = overData.semesterId as string;
    } else if (overData?.type === 'course' && overData?.source === 'timeline') {
      toSemester = overData.semesterId as string;
    }

    if (!toSemester) return;

    // ── Palette → semester: add course ──────────────────────────────────────
    if (source === 'palette') {
      const allPlaced = Object.values(plan).flat();
      if (allPlaced.includes(courseId)) return;
      dispatch({ type: 'ADD_COURSE', semesterId: toSemester, courseId });
      // Auto-open the focus editor for the target semester when adding from palette
      setFocusedSemesterId(toSemester);
      return;
    }

    // ── Timeline → different semester: move course ───────────────────────────
    if (source === 'timeline' && fromSemester && fromSemester !== toSemester) {
      dispatch({
        type: 'MOVE_COURSE',
        fromSemesterId: fromSemester,
        toSemesterId: toSemester,
        courseId,
      });
      return;
    }

    // ── Timeline → same semester: reorder ────────────────────────────────────
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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-full flex flex-col relative overflow-hidden">

        {/* ── Chrome strip: Compare + Progress + Validation (target ~30px total but
             each is 28px with border; actual total depends on how many render).
             ComparisonToggle is moved inline here to avoid occupying its own 40px band. ── */}

        {/* ── Slim chrome: progress + validation (each 28px = ~56px total, well under 60px) */}
        <ProgressBars />
        <ValidationBanner />

        {/* ── Plan Comparison Overlay ─────────────────────────────────────── */}
        <PlanComparisonPanel />

        {/* ── Main content row ────────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* ── Overview year grid (always visible) ───────────────────────── */}
          <div className={[
            'flex flex-col overflow-hidden min-h-0 transition-all duration-200',
            focusedSemesterId
              ? 'w-[260px] shrink-0 border-r border-border'  // slim strip when focused
              : 'flex-1',                                      // full width in overview
          ].join(' ')}>

            {/* Overview toolbar: Compare toggle + Courses button */}
            <div className="flex items-center gap-2 px-2 py-1 border-b border-border shrink-0">
              <ComparisonToggle />
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 gap-1 text-xs"
                onClick={() => setPaletteOpen((v) => !v)}
                aria-label="Toggle course palette"
                aria-expanded={paletteOpen}
              >
                <BookOpen className="h-3 w-3" />
                Courses
              </Button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <OverviewYearGrid
                focusedSemesterId={focusedSemesterId}
                onTileClick={handleTileClick}
              />
            </div>
          </div>

          {/* ── Focus editor (shown when a tile is clicked) ──────────────── */}
          {focusedSemesterId && (
            <div className="flex-1 overflow-hidden min-h-0 border-l border-border">
              <FocusEditor
                focusedSemesterId={focusedSemesterId}
                onClose={() => setFocusedSemesterId(null)}
              />
            </div>
          )}
        </div>

        {/* ── Chat slide-in panel ──────────────────────────────────────────── */}
        <aside
          className={[
            'absolute inset-y-0 right-0 w-80',
            'bg-background border-l border-border shadow-lg',
            'flex flex-col transition-transform duration-300 ease-in-out z-20',
            chatOpen ? 'translate-x-0' : 'translate-x-full',
          ].join(' ')}
          aria-label="AI chat panel"
        >
          <div className="flex items-center justify-between p-4 border-b border-border">
            <span className="font-medium">AI Chat</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChatOpen(false)}
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ChatPanel />
          </div>
        </aside>

        {/* ── What-If slide-in panel ────────────────────────────────────────── */}
        <aside
          className={[
            'absolute inset-y-0 right-0 w-80',
            'bg-background border-l border-border shadow-lg',
            'flex flex-col transition-transform duration-300 ease-in-out z-30',
            whatIfOpen ? 'translate-x-0' : 'translate-x-full',
          ].join(' ')}
          aria-label="What-If simulator panel"
        >
          <WhatIfPanel onClose={() => setWhatIfOpen(false)} />
        </aside>

        {/* ── Course palette slide-in drawer ───────────────────────────────── */}
        <aside
          className={[
            'absolute inset-y-0 right-0 w-72',
            'bg-background border-l border-border shadow-lg',
            'flex flex-col transition-transform duration-300 ease-in-out z-20',
            paletteOpen ? 'translate-x-0' : 'translate-x-full',
          ].join(' ')}
          aria-label="Course palette"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-sm font-medium">Courses</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPaletteOpen(false)}
              aria-label="Close course palette"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <CoursePalette />
          </div>
        </aside>
      </div>

      {/* ── Drag overlay — floats under cursor while dragging ──────────────── */}
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
  );
}
