/**
 * MobilePlanList — single-column, vertically-scrolling plan view for the
 * minimalist shell at narrow viewports (<768px).
 *
 * Years are stacked top-to-bottom (Year label header → its Fall/Spring/Summer
 * cards), each card a full-width MobileSemesterCard sized for touch. This is the
 * mobile counterpart to the desktop OverviewYearGrid; it reads the same plan
 * context + diagnostics/stress hooks so the two views stay in sync. The desktop
 * grid is reused as-is (HomeMinimalist renders it at md+); this component owns the
 * narrow layout the design prioritises.
 */

import { useMemo } from 'react';
import { useSemesters, usePlan } from '@/context/PlanContext';
import {
  useCatalogRecord,
  usePrereqGraph as useRawPrereqGraph,
  useUserProfile,
  useDataLoading,
} from '@/context/DataContext';
import { useStressScore } from '@/hooks/useStressScore';
import { useDiagnostics } from '@/hooks/useDiagnostics';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import { buildTermLoadCredits } from '@/lib/course-utils';
import { getCreditHourCap } from '@/lib/auto-planner';
import type { Semester } from '@/types';
import MobileSemesterCard from './MobileSemesterCard';

// Academic year N = Fall(N) through Summer(N+1) (same rule as OverviewYearGrid).
function academicYearOf(semester: Semester): number {
  if (semester.season === 'Fall') return semester.year;
  return semester.year - 1;
}

const SEASON_ORDER: Record<string, number> = { Fall: 0, Spring: 1, Summer: 2 };

interface MobilePlanListProps {
  focusedSemesterId: string | null;
  onTileClick: (semesterId: string) => void;
}

export default function MobilePlanList({ focusedSemesterId, onTileClick }: MobilePlanListProps) {
  const semesters = useSemesters();
  const plan = usePlan();
  const catalog = useCatalogRecord();
  const rawPrereqGraph = useRawPrereqGraph();
  const userProfile = useUserProfile();
  const effectiveProfile = useEffectiveProfile();
  const loading = useDataLoading();
  const stressScores = useStressScore();
  const diagnostics = useDiagnostics();

  const prereqNodes = rawPrereqGraph?.nodes ?? {};

  const transcriptCredits = useMemo(
    () => buildTermLoadCredits(userProfile),
    [userProfile],
  );

  const creditHourCap =
    diagnostics?.semesterSlack[0]?.cap ?? getCreditHourCap(effectiveProfile);

  // Group into academic years, then order seasons within each year.
  const yearGroups = useMemo(() => {
    const groups = new Map<number, Semester[]>();
    for (const sem of semesters) {
      const ay = academicYearOf(sem);
      if (!groups.has(ay)) groups.set(ay, []);
      groups.get(ay)!.push(sem);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (SEASON_ORDER[a.season] ?? 9) - (SEASON_ORDER[b.season] ?? 9));
    }
    return groups;
  }, [semesters]);

  const sortedYears = useMemo(
    () => Array.from(yearGroups.keys()).sort((a, b) => a - b),
    [yearGroups],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-3" data-testid="minimalist-mobile-list">
      <div className="flex flex-col gap-5 max-w-md mx-auto">
        {sortedYears.map((ay) => (
          <section key={ay} aria-label={`Academic year ${ay}–${String(ay + 1).slice(2)}`}>
            <h2 className="sticky top-0 z-10 -mx-3 px-3 py-1.5 bg-background/90 backdrop-blur text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {ay}–{String(ay + 1).slice(2)}
            </h2>
            <div className="mt-2 flex flex-col gap-2">
              {yearGroups.get(ay)!.map((sem) => (
                <MobileSemesterCard
                  key={sem.id}
                  semester={sem}
                  courseIds={plan[sem.id] ?? []}
                  catalog={catalog}
                  prereqNodes={prereqNodes}
                  transcriptCredits={transcriptCredits}
                  creditHourCap={creditHourCap}
                  stressResult={stressScores?.get(sem.id) ?? null}
                  isFocused={focusedSemesterId === sem.id}
                  onClick={() => onTileClick(sem.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
