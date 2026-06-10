/**
 * OverviewYearGrid — year-grid overview (rows = academic years, columns = Fall/Spring/Summer).
 *
 * Academic-year grouping: academic year N = Fall(N) + Spring(N+1) + Summer(N+1).
 * For example: Fall 2025 + Spring 2026 + Summer 2026 = AY 2025–26.
 *
 * Rows are derived dynamically from semesters data. Each cell is a SemesterTile.
 * Empty cells (semester not in data) render nothing.
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
import { buildTranscriptCredits } from '@/lib/course-utils';
import type { Semester } from '@/types';

// ─── Academic-year key: "Fall 2025 → 2025", "Spring 2026 → 2025", "Summer 2026 → 2025"
// Academic year N = Fall(N) through Summer(N+1).

function academicYearOf(semester: Semester): number {
  if (semester.season === 'Fall') return semester.year;
  // Spring and Summer belong to the academic year that started the previous Fall
  return semester.year - 1;
}

// ─── Column order ─────────────────────────────────────────────────────────────

const SEASON_ORDER: Record<string, number> = { Fall: 0, Spring: 1, Summer: 2 };

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
  const loading = useDataLoading();

  const prereqNodes = rawPrereqGraph?.nodes ?? {};
  const transcriptCredits = useMemo(
    () => buildTranscriptCredits(userProfile),
    [userProfile]
  );

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

  // Which season columns actually appear across all semesters
  const seasonsPresent = useMemo(() => {
    const set = new Set<string>();
    for (const sem of semesters) set.add(sem.season);
    const all = ['Fall', 'Spring', 'Summer'];
    return all.filter((s) => set.has(s));
  }, [semesters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-0 overflow-hidden">
      {/* Column headers */}
      <div
        className="grid shrink-0 gap-1.5 px-2 pb-0.5"
        style={{ gridTemplateColumns: `60px repeat(${seasonsPresent.length}, 1fr)` }}
      >
        <div /> {/* year label column */}
        {seasonsPresent.map((season) => (
          <div key={season} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">
            {season}
          </div>
        ))}
      </div>

      {/* Year rows */}
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden px-2 pb-1">
        {sortedYears.map((ay) => {
          const seasonMap = yearGroups.get(ay)!;
          // Row height: flex-1 divided equally — each row gets exactly 1 fraction
          return (
            <div
              key={ay}
              className="flex-1 min-h-0 grid gap-1.5 items-stretch"
              style={{ gridTemplateColumns: `60px repeat(${seasonsPresent.length}, 1fr)` }}
            >
              {/* Academic year label */}
              <div className="flex items-center justify-center text-[10px] font-medium text-muted-foreground leading-tight text-center">
                <span>{ay}–{String(ay + 1).slice(2)}</span>
              </div>

              {/* Season cells */}
              {seasonsPresent.map((season) => {
                const sem = seasonMap.get(season);
                if (!sem) {
                  // Empty cell — no semester for this season in this year
                  return <div key={season} />;
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
                    onClick={() => onTileClick(sem.id)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
