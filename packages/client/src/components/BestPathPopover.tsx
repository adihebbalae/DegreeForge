/**
 * BestPathPopover — TASK-093
 *
 * Self-contained "Best Path" dropdown at the right end of OptimizeStrip.
 * Shows the critical path + bottleneck list from diagnostics.
 * Zero vertical cost while closed (dropdown opens downward on click).
 * Hidden entirely when there is no critical path and no bottlenecks.
 */

import { AlertTriangle, ChevronDown, GitBranch, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDiagnostics } from '@/hooks/useDiagnostics';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function BestPathPopover() {
  const diagnostics = useDiagnostics();

  if (!diagnostics) return null;

  const { criticalPath, bottlenecks } = diagnostics;
  const hasBottlenecks = bottlenecks.length > 0;
  const hasCriticalPath = criticalPath.chain.length > 0;

  if (!hasBottlenecks && !hasCriticalPath) return null;

  const hasZeroSlack = bottlenecks.some((b) => b.slack === 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'h-6 inline-flex items-center gap-1 px-2 rounded text-[11px] font-medium',
            'border border-border bg-background hover:bg-accent hover:text-accent-foreground',
            'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          aria-label="Show best path diagnostics"
        >
          {hasBottlenecks && hasZeroSlack && (
            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" aria-hidden="true" />
          )}
          <span>Best Path</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
          {hasBottlenecks && (
            <span className={cn(
              'ml-0.5 text-[10px] font-semibold shrink-0',
              hasZeroSlack ? 'text-amber-500' : 'text-muted-foreground',
            )}>
              {bottlenecks.length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-3" onCloseAutoFocus={(e) => e.preventDefault()}>
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
                <span className="text-[9px] text-muted-foreground pl-4">
                  +{bottlenecks.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
