/**
 * BestPathContent — shared presentational component
 *
 * Renders the critical-path chain + bottleneck list from a DiagnosticsResult.
 * Used by BestPathPopover (dropdown) and FocusTabbedPanel (Best Path tab).
 * Purely presentational — no hooks, no data fetching.
 *
 * Bottlenecks are capped at 4 with a "+N more" overflow indicator.
 * Chain coloring: placed courses (semesterId set) → text-foreground;
 * unplaced → text-muted-foreground (matches BestPathPopover convention).
 */

import { AlertTriangle, GitBranch, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DiagnosticsResult } from '@/lib/diagnostics';

interface BestPathContentProps {
  criticalPath: DiagnosticsResult['criticalPath'];
  bottlenecks: DiagnosticsResult['bottlenecks'];
}

export default function BestPathContent({ criticalPath, bottlenecks }: BestPathContentProps) {
  const hasCriticalPath = criticalPath.chain.length > 0;
  const hasBottlenecks = bottlenecks.length > 0;
  const visibleBottlenecks = bottlenecks.slice(0, 4);
  const overflow = bottlenecks.length - 4;

  return (
    <div className="flex flex-col gap-2">
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

      {/* Bottleneck flags (capped at 4) */}
      {hasBottlenecks && (
        <div className="flex flex-col gap-0.5">
          {visibleBottlenecks.map((b) => (
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
          {overflow > 0 && (
            <span className="text-[9px] text-muted-foreground pl-5">
              +{overflow} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
