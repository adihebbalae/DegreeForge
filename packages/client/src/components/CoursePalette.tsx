import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  useCatalogRecord,
  usePrereqGraph as useRawPrereqGraph,
  useGradeDistributions,
  useUserProfile,
  useDegreeRequirements,
  useTechCoresRecord,
  useMathRequirements,
} from '@/context/DataContext';
import { usePlan, useHoveredCourse, useTechCoreId, useMathBAToggle } from '@/context/PlanContext';
import { getCourseTitle } from '@/lib/course-utils';
import CollapsibleSection from './CollapsibleSection';
import CourseCard from './CourseCard';
import type { CourseCatalog, CourseCategory, PrereqNode } from '@/types';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';

// ─── Draggable palette card ────────────────────────────────────────────────────

interface DraggablePaletteCardProps {
  courseId: string;
  catalog: CourseCatalog | null;
  prereqNodes: Record<string, PrereqNode>;
  gradeDistributions: Record<string, { avg_gpa: number }>;
  categoryOverride: CourseCategory;
  prereqsMet: boolean;
  isDownstreamHighlight?: boolean;
}

function DraggablePaletteCard({
  courseId,
  catalog,
  prereqNodes,
  gradeDistributions,
  categoryOverride,
  prereqsMet,
  isDownstreamHighlight,
}: DraggablePaletteCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${courseId}`,
    data: {
      type: 'course',
      courseId,
      source: 'palette',
    },
  });

  return (
    // Don't apply transform — DragOverlay handles the moving visual.
    // The original card ghosts in place via isDragging → opacity 0.5.
    <div ref={setNodeRef} {...attributes} {...listeners} className="touch-none">
      <CourseCard
        courseId={courseId}
        catalog={catalog}
        prereqNodes={prereqNodes}
        gradeDistributions={gradeDistributions}
        categoryOverride={categoryOverride}
        variant="palette"
        prereqsMet={prereqsMet}
        isDragging={isDragging}
        isDownstreamHighlight={isDownstreamHighlight}
      />
    </div>
  );
}

// ─── Equivalency Map ─────────────────────────────────────────────────────────
//
// Maps a canonical course ID → alternative IDs that satisfy the same requirement.
// Used so that e.g. completing old-number ECE 302 satisfies ECE 402, or
// honors-section ECE 312H satisfies ECE 412.

const COURSE_EQUIVALENCIES: Record<string, string[]> = {
  // New 2026-2028 catalog numbers → old / honors alternatives
  'ECE 402': ['ECE 302', 'ECE 302H'],
  'ECE 406': ['ECE 306', 'ECE 306H'],
  'ECE 412': ['ECE 312', 'ECE 312H'],
  'ECE 419K': ['ECE 319K', 'ECE 319H'],
  // Math: M 508M is a transfer dual-credit covering both 408C and 408D
  'M 408D': ['M 508M', 'M 408M', 'M 408S'],
  // Linear algebra: M 411 transfer covers M 340L / M 341
  'M 340L': ['M 411', 'M 341'],
};

/** True if courseId is satisfied (directly or via an equivalency) in the given set. */
function isCourseSatisfied(courseId: string, satisfiedSet: Set<string>): boolean {
  if (satisfiedSet.has(courseId)) return true;
  const alts = COURSE_EQUIVALENCIES[courseId];
  return alts?.some((alt) => satisfiedSet.has(alt)) ?? false;
}

// ─── Static course lists ──────────────────────────────────────────────────────

/**
 * Representative Gen Ed courses — one concrete option per core slot that has
 * a fixed course ID.  Slots that say "list_of_approved" (VAPA, SBS) are omitted
 * because there is no single recommended course.
 */
const GEN_ED_REPRESENTATIVE = [
  'UGS 302', // First-Year Signature Course (Core 090)
  // RHE 306 is satisfied by credit-by-exam — excluded
  'E 316L',  // Humanities (Core 040) — first option
  'HIS 315K', // US History I (Core 060)
  'HIS 315L', // US History II (Core 060)
  'GOV 310L', // American Government I (Core 070)
  'GOV 312L', // American Government II (Core 070)
];

/** Required physics lab sequence (corequisites with lecture sections). */
const PHYSICS_COURSES = ['PHY 303K', 'PHY 105M', 'PHY 303L', 'PHY 105N'];

/**
 * Math courses relevant for the Math BA double-major Adi is considering,
 * beyond what the BSECE already requires.
 */
const MATH_BA_ADDITIONAL = [
  'M 361K', // Real Analysis I (Math BA: real_analysis option)
  'M 365C', // Real Analysis I alternate
  'M 362K', // Probability I (Math BA: probability)
  'M 374M', // Numerical Analysis: Linear Algebra (Math BA: broadening)
  'M 378K', // Introduction to Mathematical Statistics (Math BA: broadening)
  'M 368K', // Numerical Methods for Applications (Math BA: broadening)
];

// ─── What-If Diff Component ──────────────────────────────────────────────────

function WhatIfDiff() {
  const profile = useUserProfile();
  const techCores = useTechCoresRecord();
  const techCoreId = useTechCoreId();
  const mathBAToggle = useMathBAToggle();

  if (!profile || !techCores) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim();
  const declaredNormalized = normalize(profile.tech_core.declared);
  const originalTrackId = Object.keys(techCores).find(
    (key) => normalize(techCores[key].name) === declaredNormalized
  ) || 'computer_architecture';

  const isChanged = techCoreId !== originalTrackId || mathBAToggle;

  if (!isChanged) return null;

  const originalTrack = techCores[originalTrackId];
  const newTrack = techCores[techCoreId];

  return (
    <div className="mx-2 mb-3 p-2 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-md">
      <p className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-tight mb-1">
        What-If Active
      </p>
      <div className="space-y-1">
        {techCoreId !== originalTrackId && (
          <p className="text-[11px] text-foreground leading-tight">
            • Using <span className="font-semibold">{newTrack?.name}</span> track
          </p>
        )}
        {mathBAToggle && (
          <p className="text-[11px] text-foreground leading-tight">
            • <span className="font-semibold">Math BA</span> requirements active
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CoursePalette() {
  const [query, setQuery] = useState('');

  // ── Data ──────────────────────────────────────────────────────────────────
  const catalog = useCatalogRecord();
  const rawPrereqGraph = useRawPrereqGraph();
  const gradeDistributions = useGradeDistributions();
  const userProfile = useUserProfile();
  const degreeRequirements = useDegreeRequirements();
  const techCoresRecord = useTechCoresRecord();
  // mathRequirements loaded but currently used only to confirm Math BA courses
  useMathRequirements();

  const plan = usePlan();
  const hoveredCourse = useHoveredCourse();
  const prereqGraphInstance = usePrereqGraph();
  const techCoreId = useTechCoreId();
  const mathBAToggle = useMathBAToggle();

  /** Set of courses to highlight as downstream dependents of the hovered course. */
  const downstreamCourses = useMemo(() => {
    if (!hoveredCourse) return new Set<string>();
    return new Set(prereqGraphInstance.getDownstream(hoveredCourse));
  }, [hoveredCourse, prereqGraphInstance]);

  // ── Derived sets ──────────────────────────────────────────────────────────

  /** All course IDs currently placed in any semester of the plan. */
  const allPlacedCourses = useMemo(
    () => Object.values(plan).flat(),
    [plan]
  );

  const completedCourseIds = useMemo(
    () => new Set((userProfile?.completed_courses ?? []).map((c) => c.course)),
    [userProfile]
  );

  const inProgressCourseIds = useMemo(
    () => new Set((userProfile?.in_progress_courses ?? []).map((c) => c.course)),
    [userProfile]
  );

  /**
   * Full "done or planned" set — completed + in-progress + placed in timeline.
   * Used to compute REMAINING courses for each palette section.
   */
  const satisfiedSet = useMemo(
    () => new Set<string>([...completedCourseIds, ...inProgressCourseIds, ...allPlacedCourses]),
    [completedCourseIds, inProgressCourseIds, allPlacedCourses]
  );

  /**
   * Subset used for PREREQ DIMMING — only courses Adi has already finished or
   * is actively taking now.  Future-planned courses do not count as satisfying
   * prereqs for palette display purposes.
   */
  const prereqSatisfiedSet = useMemo(
    () => new Set<string>([...completedCourseIds, ...inProgressCourseIds]),
    [completedCourseIds, inProgressCourseIds]
  );

  // ── Prereq graph lookup ───────────────────────────────────────────────────

  /**
   * Map: courseId → direct prerequisite course IDs (from graph edges).
   * Edges may represent OR-alternatives (e.g. "ECE 306 OR ECE 306H"), so
   * we treat them as a flat set and dim only when NO alternative is satisfied.
   */
  const prereqsOf = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const edge of rawPrereqGraph.edges) {
      if (edge.type === 'prerequisite') {
        if (!map[edge.to]) map[edge.to] = [];
        map[edge.to].push(edge.from);
      }
    }
    return map;
  }, [rawPrereqGraph.edges]);

  /**
   * Returns true when a course should be dimmed (no satisfying prereq found).
   *
   * Treats all direct prereq edges as OR alternatives: if at least one is in
   * prereqSatisfiedSet the course is NOT dimmed.  This avoids false-positive
   * dimming caused by OR-grouped alternatives in the flat edge list.
   */
  const hasUnmetPrereqs = (courseId: string): boolean => {
    const prereqs = prereqsOf[courseId];
    if (!prereqs || prereqs.length === 0) return false;
    // Dim only when EVERY listed prereq is unsatisfied (i.e. none of the
    // alternatives, even equivalencies, have been taken).
    return prereqs.every((p) => !prereqSatisfiedSet.has(p));
  };

  // ── Tech core track ───────────────────────────────────────────────────────

  /** Selected tech core track from tech-cores.json. */
  const techTrack = useMemo(
    () => techCoresRecord?.[techCoreId] ?? null,
    [techCoresRecord, techCoreId]
  );

  // ── Category: ECE Core ────────────────────────────────────────────────────

  const eceCoreRemaining = useMemo(() => {
    if (!degreeRequirements) return [];
    return degreeRequirements.ece_core.courses.filter(
      (id) => !isCourseSatisfied(id, satisfiedSet)
    );
  }, [degreeRequirements, satisfiedSet]);

  // ── Category: Tech Core (required specific courses) ───────────────────────

  const techCoreRequired = useMemo(() => {
    if (!techTrack) return [];
    const courses: string[] = [];

    // Named core courses (ECE 316, ECE 460N for CA&ES)
    for (const entry of techTrack.required_courses.core ?? []) {
      if ('id' in entry) {
        courses.push(entry.id);
      }
      // pick-one entries without a canonical single ID are skipped here;
      // they appear in the elective pool section instead
    }

    // Core lab (ECE 445L for CA&ES)
    const lab = techTrack.required_courses.core_lab;
    if (lab && 'id' in lab) courses.push(lab.id);

    // Required elective (ECE 360C for CA&ES)
    const re = techTrack.required_courses.required_elective;
    if (re && 'id' in re) courses.push(re.id);

    return courses.filter((id) => !isCourseSatisfied(id, satisfiedSet));
  }, [techTrack, satisfiedSet]);

  // ── Category: Free Electives (tech-core elective pool) ───────────────────

  const freeElectivesPool = useMemo(() => {
    if (!techTrack) return [];
    return techTrack.elective_pool.filter(
      (id) => !isCourseSatisfied(id, satisfiedSet)
    );
  }, [techTrack, satisfiedSet]);

  // ── Category: Gen Ed ─────────────────────────────────────────────────────

  const genEdRemaining = useMemo(() => {
    return [...GEN_ED_REPRESENTATIVE, ...PHYSICS_COURSES].filter(
      (id) => !isCourseSatisfied(id, satisfiedSet)
    );
  }, [satisfiedSet]);

  // ── Category: Math ────────────────────────────────────────────────────────

  const mathRemaining = useMemo(() => {
    const courses: string[] = [];

    // BSECE required math sequence
    if (degreeRequirements) {
      courses.push(...degreeRequirements.math_sequence.required);
    }

    // Tech-core advanced math (M 325K for CA&ES)
    if (techTrack?.required_courses.advanced_math) {
      courses.push(techTrack.required_courses.advanced_math.id);
    }

    // Math BA additional courses (for Adi's double-major consideration)
    if (mathBAToggle) {
      courses.push(...MATH_BA_ADDITIONAL);
    }

    return [...new Set(courses)].filter(
      (id) => !isCourseSatisfied(id, satisfiedSet)
    );
  }, [degreeRequirements, techTrack, satisfiedSet, mathBAToggle]);

  // ── Search filter ─────────────────────────────────────────────────────────

  const filterCourses = (courses: string[]): string[] => {
    if (!query.trim()) return courses;
    const q = query.toLowerCase();
    return courses.filter((id) => {
      if (id.toLowerCase().includes(q)) return true;
      const title = getCourseTitle(id, catalog, rawPrereqGraph.nodes);
      return title.toLowerCase().includes(q);
    });
  };

  const filteredEceCore = filterCourses(eceCoreRemaining);
  const filteredTechCore = filterCourses(techCoreRequired);
  const filteredElectives = filterCourses(freeElectivesPool);
  const filteredGenEd = filterCourses(genEdRemaining);
  const filteredMath = filterCourses(mathRemaining);

  // ── Palette drop zone ─────────────────────────────────────────────────────
  // Courses dragged back over the palette area are removed from the plan.

  const { setNodeRef: setPaletteDropRef, isOver: isPaletteOver } = useDroppable({
    id: 'palette',
    data: { type: 'palette' },
  });

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderCard = (courseId: string, category: CourseCategory) => (
    <DraggablePaletteCard
      key={courseId}
      courseId={courseId}
      catalog={catalog}
      prereqNodes={rawPrereqGraph.nodes}
      gradeDistributions={gradeDistributions}
      categoryOverride={category}
      prereqsMet={!hasUnmetPrereqs(courseId)}
      isDownstreamHighlight={downstreamCourses.has(courseId)}
    />
  );

  const emptyMessage = (
    <p className="text-[11px] text-muted-foreground px-2 py-1 italic">
      All done ✓
    </p>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={setPaletteDropRef}
      className={[
        'h-full flex flex-col transition-colors duration-150',
        isPaletteOver ? 'bg-red-50 dark:bg-red-950/20' : '',
      ].join(' ')}
    >
      {/* Search bar */}
      <div className="px-2 pt-2 pb-1.5 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search courses…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={[
              'w-full pl-8 pr-3 py-1.5 text-xs',
              'bg-muted border border-input rounded-md',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            ].join(' ')}
          />
        </div>
      </div>

      <WhatIfDiff />

      {/* Palette label */}
      <p className="px-3 pb-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">
        Remaining courses
      </p>

      {/* Drop-to-remove hint — shown when a timeline card hovers over the palette */}
      {isPaletteOver && (
        <div className="mx-2 mb-1 px-2 py-1.5 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-[11px] text-red-600 dark:text-red-400 text-center shrink-0">
          Release to remove from plan
        </div>
      )}

      {/* Collapsible sections */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-4">
        {/* ECE Core */}
        <CollapsibleSection title="ECE Core" count={filteredEceCore.length} defaultOpen>
          {filteredEceCore.length === 0
            ? emptyMessage
            : filteredEceCore.map((id) => renderCard(id, 'ece_core'))}
        </CollapsibleSection>

        {/* Tech Core */}
        <CollapsibleSection
          title={`Tech Core — ${techTrack?.name || 'Loading...'}`}
          count={filteredTechCore.length}
          defaultOpen
        >
          {filteredTechCore.length === 0
            ? emptyMessage
            : filteredTechCore.map((id) => renderCard(id, 'tech_core'))}
        </CollapsibleSection>

        {/* Gen Ed */}
        <CollapsibleSection title="Gen Ed" count={filteredGenEd.length} defaultOpen>
          {filteredGenEd.length === 0
            ? emptyMessage
            : filteredGenEd.map((id) => renderCard(id, 'gen_ed'))}
        </CollapsibleSection>

        {/* Free Electives */}
        <CollapsibleSection
          title="Free Electives"
          count={filteredElectives.length}
          defaultOpen={false}
        >
          {filteredElectives.length === 0
            ? emptyMessage
            : filteredElectives.map((id) => renderCard(id, 'elective'))}
        </CollapsibleSection>

        {/* Math */}
        <CollapsibleSection title="Math" count={filteredMath.length} defaultOpen>
          {filteredMath.length === 0
            ? emptyMessage
            : filteredMath.map((id) => renderCard(id, 'math'))}
        </CollapsibleSection>
      </div>
    </div>
  );
}
