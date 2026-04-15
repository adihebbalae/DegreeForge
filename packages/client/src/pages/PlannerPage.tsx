import { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
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
import TimelineGrid from '@/components/TimelineGrid';
import CoursePalette from '@/components/CoursePalette';
import CourseCard from '@/components/CourseCard';
import ValidationBanner from '@/components/ValidationBanner';
import {
  useCatalogRecord,
  usePrereqGraph,
  useGradeDistributions,
} from '@/context/DataContext';
import { usePlanDispatch, usePlan } from '@/context/PlanContext';
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
  const [chatOpen, setChatOpen] = useState(false);
  const [activeCard, setActiveCard] = useState<ActiveCardInfo | null>(null);

  // ── Dispatch + plan state (for duplicate detection + reorder) ─────────────
  const dispatch = usePlanDispatch();
  const plan = usePlan();

  // ── Data for the DragOverlay CourseCard ───────────────────────────────────
  const catalog = useCatalogRecord();
  const prereqGraph = usePrereqGraph();
  const gradeDistributions = useGradeDistributions();
  const prereqNodes: Record<string, PrereqNode> = prereqGraph?.nodes ?? {};

  // ── Sensors ───────────────────────────────────────────────────────────────
  // Require 8px movement before activating drag — prevents accidental drags on click.
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
      // Dropped on a semester container's empty area
      toSemester = overData.semesterId as string;
    } else if (overData?.type === 'course' && overData?.source === 'timeline') {
      // Dropped on top of a sortable card — use that card's semester
      toSemester = overData.semesterId as string;
    }

    if (!toSemester) return;

    // ── Palette → semester: add course ──────────────────────────────────────
    if (source === 'palette') {
      // Duplicate check: don't allow placing a course that's already in any semester
      const allPlaced = Object.values(plan).flat();
      if (allPlaced.includes(courseId)) return;
      dispatch({ type: 'ADD_COURSE', semesterId: toSemester, courseId });
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
        {/* ── Progress bars strip ─────────────────────────────────────────── */}
        <ProgressBars />

        {/* ── Validation banner (TASK-010) ────────────────────────────────── */}
        <ValidationBanner />

        {/* ── Main content row ────────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">
          {/* Semester timeline grid — left ~65% */}
          <div className="flex-[65] overflow-hidden border-r border-border">
            <TimelineGrid />
          </div>

          {/* Course palette — right ~35% */}
          <div className="flex-[35] overflow-hidden">
            <CoursePalette />
          </div>
        </div>

        {/* ── Chat slide-in panel ──────────────────────────────────────────── */}
        <aside
          className={[
            'absolute inset-y-0 right-0 w-80',
            'bg-background border-l border-border shadow-lg',
            'flex flex-col transition-transform duration-300 ease-in-out',
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
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-sm text-muted-foreground">Chat panel — TASK-013</p>
          </div>
        </aside>

        {/* ── Chat floating toggle button ──────────────────────────────────── */}
        {!chatOpen && (
          <Button
            className="absolute bottom-4 right-4 shadow-lg"
            size="icon"
            onClick={() => setChatOpen(true)}
            aria-label="Open AI chat"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
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
