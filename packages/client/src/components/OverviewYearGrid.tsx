/**
 * OverviewYearGrid — year-grid overview (columns = academic years, rows = Fall/Spring/Summer).
 *
 * Academic-year grouping: academic year N = Fall(N) + Spring(N+1) + Summer(N+1).
 * For example: Fall 2025 + Spring 2026 + Summer 2026 = AY 2025–26.
 *
 * Columns are derived dynamically from semesters data. Each cell is a SemesterTile.
 * Empty cells (semester not in data) render the faint dashed placeholder.
 */

import { useMemo } from 'react';
import { useSemesters, usePlan } from '@/context/PlanContext';
import {
  useCatalogRecord,
  usePrereqGraph as useRawPrereqGraph,
  useGradeDistributions,
  useUserProfile,
  useDataLoading,
} from '@/context/DataContext';
import SemesterTile from './SemesterTile';
import { useDiagnostics } from '@/hooks/useDiagnostics';
import { useStressScore } from '@/hooks/useStressScore';
import { buildTermLoadCredits } from '@/lib/course-utils';
import { getCreditHourCap } from '@/lib/auto-planner';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import type { Semester } from '@/types';

// ─── Academic-year key: "Fall 2025 → 2025", "Spring 2026 → 2025", "Summer 2026 → 2025"
// Academic year N = Fall(N) through Summer(N+1).

function academicYearOf(semester: Semester): number {
  if (semester.season === 'Fall') return semester.year;
  // Spring and Summer belong to the academic year that started the previous Fall
  return semester.year - 1;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface OverviewYearGridProps {
  focusedSemesterId: string | null;
  onTileClick: (semesterId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OverviewYearGrid({ focusedSemesterId, onTileClick }: OverviewYearGridProps) {
  const semesters = useSemesters();
  const plan = usePlan();
  const catalog = useCatalogRecord();
  const rawPrereqGraph = useRawPrereqGraph();
  const gradeDistributions = useGradeDistributions();
  const userProfile = useUserProfile();
  const effectiveProfile = useEffectiveProfile();
  const loading = useDataLoading();

  const prereqNodes = rawPrereqGraph?.nodes ?? {};
  // Term-load credits: AP/transfer/credit_by_exam mapped to 0 so they don't
  // inflate the tile's "N/cap hrs" display. Degree progress still counts all
  // sources (handled in progress.ts via buildTranscriptCredits).
  const transcriptCredits = useMemo(
    () => buildTermLoadCredits(userProfile),
    [userProfile]
  );

  // Diagnostics — memoized computation of critical path, slack, and bottlenecks
  const diagnostics = useDiagnostics();

  // Stress Scores — memoized per-semester difficulty signal (TASK-059)
  const stressScores = useStressScore();

  // Build semesterId → slackLabel map for SemesterTile
  const slackBySemester = useMemo(() => {
    if (!diagnostics) return new Map<string, string>();
    return new Map(
      diagnostics.semesterSlack.map((s) => [s.semesterId, s.label])
    );
  }, [diagnostics]);

  // Credit-hour cap: prefer the diagnostics-derived cap (reads the user's load tolerance);
  // fall back to getCreditHourCap(effectiveProfile) which also respects the Settings override.
  // Use the same canonical effectiveProfile source as FocusEditor so overview and detail agree.
  const creditHourCap =
    diagnostics?.semesterSlack[0]?.cap ??
    getCreditHourCap(effectiveProfile);

  // ── Group semesters into academic years ────────────────────────────────────
  // Result: Map<academicYear, Map<season, Semester>>
  const yearGroups = useMemo(() => {
    const groups = new Map<number, Map<string, Semester>>();
    for (const sem of semesters) {
      const ay = academicYearOf(sem);
      if (!groups.has(ay)) groups.set(ay, new Map());
      groups.get(ay)!.set(sem.season, sem);
    }
    return groups;
  }, [semesters]);

  // Sorted academic years
  const sortedYears = useMemo(
    () => Array.from(yearGroups.keys()).sort((a, b) => a - b),
    [yearGroups]
  );

  // When focused, the grid runs as a slim strip alongside the FocusEditor and
  // should show ONLY the academic year that CONTAINS the focused semester
  // (its Fall/Spring/Summer trio) — e.g. focus Spring 2028 → 2027–28 strip.
  // Clicking a tile re-focuses it, swapping the strip to that semester's year.
  // Unfocused overview shows every academic year.
  const displayYears = useMemo(() => {
    if (!focusedSemesterId) return sortedYears;
    const focusedSem = semesters.find((s) => s.id === focusedSemesterId);
    if (!focusedSem) return sortedYears;
    const focusedAy = academicYearOf(focusedSem);
    return sortedYears.includes(focusedAy) ? [focusedAy] : sortedYears;
  }, [focusedSemesterId, semesters, sortedYears]);

  // Which season rows actually appear across all semesters, in canonical order
  const seasonsPresent = useMemo(() => {
    const set = new Set<string>();
    for (const sem of semesters) set.add(sem.season);
    return ['Fall', 'Spring', 'Summer'].filter((s) => set.has(s));
  }, [semesters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  // Transposed layout: columns = academic years, rows = seasons.
  // Season-label gutter is 44px; year columns grow to fill width (minmax 200px, 1fr).
  const gridCols = `44px repeat(${displayYears.length}, minmax(200px, 1fr))`;

  return (
    <div className="h-full flex flex-col gap-0 overflow-x-auto overflow-y-hidden">

      {/* Column headers: left corner gutter + one header per academic year */}
      <div
        className="grid shrink-0 gap-1.5 px-2 pb-0.5"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div /> {/* season-label gutter corner */}
        {displayYears.map((ay) => (
          <div key={ay} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">
            {ay}–{String(ay + 1).slice(2)}
          </div>
        ))}
      </div>

      {/* Season rows: one row per season, each flex-1 to fill height equally */}
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden px-2 pb-1">
        {seasonsPresent.map((season) => (
          <div
            key={season}
            className="flex-1 min-h-0 grid gap-1.5 items-stretch"
            style={{ gridTemplateColumns: gridCols }}
          >
            {/* Season label cell — slim left gutter */}
            <div className="flex items-center justify-center">
              <span
                className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider select-none"
                style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
              >
                {season}
              </span>
            </div>

            {/* One tile per academic year */}
            {displayYears.map((ay) => {
              const seasonMap = yearGroups.get(ay);
              const sem = seasonMap?.get(season);
              if (!sem) {
                // Placeholder for a season slot absent in this academic year
                // (e.g. Summer 2029 when the plan ends at Spring 2029).
                return (
                  <div
                    key={ay}
                    aria-hidden="true"
                    className="rounded-lg bg-muted/30 border border-dashed border-border/25 min-h-[96px]"
                  />
                );
              }
              return (
                <SemesterTile
                  key={sem.id}
                  semester={sem}
                  courseIds={plan[sem.id] ?? []}
                  catalog={catalog}
                  prereqNodes={prereqNodes}
                  gradeDistributions={gradeDistributions}
                  transcriptCredits={transcriptCredits}
                  isFocused={focusedSemesterId === sem.id}
                  slackLabel={slackBySemester.get(sem.id) ?? null}
                  creditHourCap={creditHourCap}
                  stressResult={stressScores?.get(sem.id) ?? null}
                  onClick={() => onTileClick(sem.id)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
