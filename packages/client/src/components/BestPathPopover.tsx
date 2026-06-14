/**
 * BestPathPopover — TASK-093
 *
 * Self-contained "Best Path" dropdown at the right end of OptimizeStrip.
 * Shows the critical path + bottleneck list from diagnostics.
 * Zero vertical cost while closed (dropdown opens downward on click).
 * Hidden entirely when there is no critical path and no bottlenecks.
 */

import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDiagnostics } from '@/hooks/useDiagnostics';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import BestPathContent from '@/components/BestPathContent';

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
        <BestPathContent criticalPath={criticalPath} bottlenecks={bottlenecks} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
