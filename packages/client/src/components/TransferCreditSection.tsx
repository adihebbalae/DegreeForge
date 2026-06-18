/**
 * TransferCreditSection — compact reference panel for AP / transfer / credit-by-exam
 * courses that are NOT placed in any semester tile on the planner grid.
 *
 * These courses count toward degree progress (via profile.completed_courses) but
 * have no UT residence term, so they are excluded from deriveTimelinePlanFromProfile
 * and shown here instead.
 *
 * Rendered below the year grid on both the desktop PlannerPage and the mobile
 * HomeMinimalist shell (desktop only; mobile noted as follow-up due to layout scope).
 */

import { useMemo } from 'react';
import { useUserProfile, useCatalogRecord } from '@/context/DataContext';
import type { CreditSource } from '@/types';

// ─── Source display metadata ───────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  ap: 'AP',
  transfer: 'Transfer',
  credit_by_exam: 'Credit by Exam',
  // type-field fallbacks (demo profile)
  advanced_placement: 'AP',
  'credit by exam': 'Credit by Exam',
  dual_enrollment: 'Transfer',
};

const SOURCE_ORDER: string[] = ['transfer', 'ap', 'credit_by_exam'];

const GROUP_LABEL: Record<string, string> = {
  transfer: 'Transfer Credit',
  ap: 'AP Credit',
  credit_by_exam: 'Credit by Exam',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Canonical group key for a completed-course entry. */
function groupKey(cc: { source?: CreditSource; type?: string }): string | null {
  const src = cc.source ?? 'in_residence';
  if (src !== 'in_residence') return src;
  const typ = (cc.type ?? '').toLowerCase();
  if (typ === 'transfer' || typ === 'dual enrollment') return 'transfer';
  if (typ === 'ap' || typ === 'advanced placement') return 'ap';
  if (typ === 'credit by exam') return 'credit_by_exam';
  return null; // in-residence — excluded
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransferCreditSection() {
  const userProfile = useUserProfile();
  const catalog = useCatalogRecord();

  // Group non-residence completed courses by source
  const groups = useMemo(() => {
    if (!userProfile) return null;
    const map: Record<string, Array<{ course: string; title: string; hours: number }>> = {};
    for (const cc of userProfile.completed_courses) {
      const key = groupKey(cc);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      // Prefer catalog title if available and not empty
      const catalogTitle = catalog?.[cc.course]?.title;
      const title = (catalogTitle && catalogTitle.length > 0) ? catalogTitle : cc.title;
      map[key].push({ course: cc.course, title, hours: cc.credit_hours });
    }
    return map;
  }, [userProfile, catalog]);

  if (!groups || Object.keys(groups).length === 0) return null;

  // Total hours across all non-residence sources
  const totalHours = Object.values(groups)
    .flat()
    .reduce((sum, c) => sum + (c.hours ?? 0), 0);

  // Render groups in canonical order; unknown keys appended at end
  const orderedKeys = [
    ...SOURCE_ORDER.filter((k) => groups[k]),
    ...Object.keys(groups).filter((k) => !SOURCE_ORDER.includes(k)),
  ];

  return (
    <section
      aria-label="Transfer and exam credit"
      className="shrink-0 border-t border-border bg-muted/20 px-3 py-2"
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Transfer &amp; Exam Credit
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {totalHours} hrs
        </span>
      </div>

      {/* Groups */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {orderedKeys.map((key) => (
          <div key={key} className="min-w-0">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mr-1.5">
              {GROUP_LABEL[key] ?? SOURCE_LABEL[key] ?? key}
            </span>
            <span className="inline-flex flex-wrap gap-1">
              {groups[key].map((c) => (
                <span
                  key={c.course}
                  title={`${c.title} · ${c.hours} hr${c.hours !== 1 ? 's' : ''}`}
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted border border-border text-muted-foreground leading-none"
                >
                  {c.course}
                  <span className="text-[9px] opacity-60 ml-0.5">{c.hours}h</span>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
