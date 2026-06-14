/**
 * DiagnosticsPanel — TASK-043 "Best Path" diagnostics overlay.
 *
 * Renders three deterministic diagnostics in the overview:
 *   1. Critical path — the longest prereq chain of remaining required courses.
 *   2. Bottleneck flags — term-locked zero-slack courses with graduation delay cost.
 *   3. Per-semester slack is shown directly in SemesterTile (via slackBySemester prop).
 *
 * Designed to fit in the 1280×575 zero-scroll viewport. Uses a compact horizontal
 * layout: the panel is a slim collapsible strip below the year-grid header.
 *
 * No new routes, no network calls — receives diagnostics from OverviewYearGrid as a prop.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, GitBranch, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiagnosticsResult } from '@/lib/diagnostics';

// ─── Component ────────────────────────────────────────────────────────────────

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticsResult | null;
}

export default function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  const [open, setOpen] = useState(true);

  if (!diagnostics) return null;

  const { criticalPath, bottlenecks } = diagnostics;

  const hasBottlenecks = bottlenecks.length > 0;
  const hasCriticalPath = criticalPath.chain.length > 0;

  if (!hasBottlenecks && !hasCriticalPath) return null;

  return (
    <div className="shrink-0 border-b border-border bg-background">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-0.5',
          'text-[10px] font-semibold text-muted-foreground uppercase tracking-wider',
          'hover:text-foreground transition-colors',
        )}
        aria-expanded={open}
        aria-label={`${open ? 'Collapse' : 'Expand'} best-path diagnostics`}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
        )}
        <span>Best Path</span>
        {!open && hasBottlenecks && (() => {
          // Classify by worst bottleneck: zero-slack → amber warning; all have slack → blue info.
          const hasZeroSlack = bottlenecks.some((b) => b.slack === 0);
          return hasZeroSlack ? (
            <span className="ml-1 inline-flex items-center gap-0.5 text-amber-500">
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
              {bottlenecks.length}
            </span>
          ) : (
            <span className="ml-1 inline-flex items-center gap-0.5 text-muted-foreground">
              <Info className="h-2.5 w-2.5" aria-hidden="true" />
              {bottlenecks.length}
            </span>
          );
        })()}
      </button>

      {open && (
        <div className="px-2 pb-1.5 flex flex-col gap-1">
          {/* Critical path */}
          {hasCriticalPath && (
            <div className="flex items-start gap-1.5">
              <GitBranch className="h-3 w-3 mt-0.5 text-primary shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <span className="text-[9px] font-semibold text-primary uppercase tracking-wider mr-1">
                  Critical Path
                </span>
                <span
                  className="text-[10px] text-foreground/80 font-mono"
                  aria-label={`Critical path: ${criticalPath.chain.map((c) => c.courseId).join(' → ')}`}
                >
                  {criticalPath.chain.map((c, i) => (
                    <span key={c.courseId}>
                      {i > 0 && (
                        <span className="text-muted-foreground/50 mx-0.5" aria-hidden="true">
                          →
                        </span>
                      )}
                      <span
                        className={cn(
                          'inline-block',
                          c.semesterId ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {c.courseId}
                      </span>
                    </span>
                  ))}
                </span>
                {criticalPath.bottleneckSemesterId && (
                  <span className="ml-1.5 text-[9px] text-primary">
                    → earliest by prerequisites: {criticalPath.bottleneckSemesterId}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Bottleneck flags */}
          {hasBottlenecks && (
            <div className="flex flex-col gap-0.5">
              {bottlenecks.slice(0, 4).map((b) => (
                <div key={b.courseId} className="flex items-start gap-1.5">
                  {b.slack === 0 ? (
                    <AlertTriangle
                      className="h-3 w-3 mt-0.5 shrink-0 text-red-500"
                      aria-hidden="true"
                    />
                  ) : (
                    <Info
                      className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span
                      className="text-[10px] text-foreground/80 leading-tight"
                      aria-label={b.delayCost}
                    >
                      {b.delayCost}
                    </span>
                    <span className="text-[9px] text-muted-foreground leading-tight">
                      {b.whyItMatters}
                    </span>
                  </div>
                </div>
              ))}
              {bottlenecks.length > 4 && (
                <span className="text-[9px] text-muted-foreground pl-4.5">
                  +{bottlenecks.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Slack label helper (exported for SemesterTile) ───────────────────────────

/**
 * Given the diagnostics result and a semesterId, return the slack label
 * (e.g. "14 hrs spare", "full") for that semester, or null if not found.
 */
export function getSlackLabel(
  diagnostics: DiagnosticsResult | null,
  semesterId: string
): string | null {
  if (!diagnostics) return null;
  const entry = diagnostics.semesterSlack.find((s) => s.semesterId === semesterId);
  return entry?.label ?? null;
}
