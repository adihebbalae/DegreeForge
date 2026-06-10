import { useMemo } from 'react';
import { usePlan, useTechCoreId, useMathBAToggle, useWhatIf } from '@/context/PlanContext';
import {
  useCatalogRecord,
  usePrereqGraph,
  useDegreeRequirements,
  useUserProfile,
  useTechCoresRecord
} from '@/context/DataContext';
import { computeProgress } from '@/lib/progress';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { PrereqNode } from '@/types';

export function ProgressBars() {
  const plan = usePlan();
  const catalog = useCatalogRecord();
  const prereqGraph = usePrereqGraph();
  const degreeReqs = useDegreeRequirements();
  const profile = useUserProfile();
  const techCores = useTechCoresRecord();

  const currentTechCoreId = useTechCoreId();
  const currentMathBA = useMathBAToggle();
  const whatIf = useWhatIf();

  const techCoreId = whatIf.isActive ? whatIf.techCoreId : currentTechCoreId;
  const mathBAToggle = whatIf.isActive ? whatIf.mathBAToggle : currentMathBA;

  const prereqNodes: Record<string, PrereqNode> = prereqGraph?.nodes ?? {};

  const progress = useMemo(() => {
    if (!catalog || !prereqNodes || !degreeReqs || !profile || !techCores) return null;
    const techCore = techCores[techCoreId];
    if (!techCore) return null;
    return computeProgress(plan, profile, catalog, prereqNodes, degreeReqs, techCore, mathBAToggle);
  }, [plan, catalog, prereqNodes, degreeReqs, profile, techCores, techCoreId, mathBAToggle]);

  if (!progress || !profile || !techCores) {
    return (
      <div className="px-3 py-1 border-b bg-muted/10 flex items-center gap-2" style={{ height: '28px' }}>
        <div className="flex-1 h-3 animate-pulse bg-muted/20 rounded-full" />
      </div>
    );
  }

  const techCoreName = techCores[techCoreId]?.name || techCoreId;
  const suffix = whatIf.isActive ? ' (projected)' : '';

  const bars = [
    {
      label: `ECE Core`,
      completed: progress.eceCoreCompleted,
      total: progress.eceCoreTotal,
      unit: 'courses',
      color: 'bg-blue-500',
      weight: 63
    },
    {
      label: `Gen Ed`,
      completed: progress.genEdCompleted,
      total: progress.genEdTotal,
      unit: 'courses',
      color: 'bg-green-500',
      weight: 24
    },
    {
      label: `Tech Core: ${techCoreName}`,
      completed: progress.techCoreCompleted,
      total: progress.techCoreTotal,
      unit: 'courses',
      color: 'bg-purple-500',
      weight: 24
    },
    {
      label: `Electives`,
      completed: progress.electiveHours,
      total: progress.electiveTotalHours,
      unit: 'hrs',
      color: 'bg-yellow-500',
      weight: 11
    },
  ];

  if (mathBAToggle && progress.mathBATotal) {
    bars.push({
      label: `Math BA`,
      completed: progress.mathBACompleted || 0,
      total: progress.mathBATotal,
      unit: 'courses',
      color: 'bg-red-500',
      weight: 18
    });
  }

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 border-b transition-colors",
      whatIf.isActive ? "bg-yellow-500/10 border-yellow-500/30" : "bg-muted/20 border-border"
    )} style={{ height: '28px' }}>
      {whatIf.isActive && (
        <Zap className="h-3 w-3 text-yellow-600 fill-yellow-600 shrink-0" aria-hidden="true" />
      )}
      <span className="text-[10px] font-semibold tabular-nums text-muted-foreground whitespace-nowrap shrink-0">
        {progress.totalHours} / {progress.totalHoursTarget} hrs{suffix}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-1 h-3 rounded-full overflow-hidden bg-muted/50 cursor-default min-w-0">
            {bars.map((bar) => {
              const pct = Math.min(100, Math.round((bar.completed / (bar.total || 1)) * 100));
              return (
                <div
                  key={bar.label}
                  style={{ flex: bar.weight }}
                  className="h-full border-r border-background last:border-0 relative bg-muted"
                >
                  <div className={cn("h-full transition-all", bar.color)} style={{ width: `${pct}%` }} />
                </div>
              );
            })}
          </div>
        </TooltipTrigger>
        <TooltipContent className="flex flex-col gap-1.5 p-3">
          <div className="text-xs font-bold mb-1 border-b pb-1 border-border/50">Category Breakdown</div>
          {bars.map((bar) => {
            const pct = Math.min(100, Math.round((bar.completed / (bar.total || 1)) * 100));
            return (
              <div key={bar.label} className="flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full", bar.color)} />
                  <span className="font-medium">{bar.label}</span>
                </div>
                <div className="tabular-nums text-muted-foreground">
                  {bar.completed} / {bar.total} {bar.unit} ({pct}%)
                </div>
              </div>
            );
          })}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
