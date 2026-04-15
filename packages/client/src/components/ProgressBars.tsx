import React, { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { usePlan, useTechCoreId, useMathBAToggle, useWhatIf } from '@/context/PlanContext';
import { 
  useCatalogRecord, 
  usePrereqGraph, 
  useDegreeRequirements, 
  useUserProfile, 
  useTechCoresRecord 
} from '@/context/DataContext';
import { computeProgress } from '@/lib/progress';
import { BookOpen, GraduationCap, Award, Cpu, Star, Calculator, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
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

  // Use what-if settings if active, otherwise current settings
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
      <div className="px-4 py-2 border-b bg-muted/10">
        <div className="h-20 animate-pulse bg-muted/20 rounded-md" />
      </div>
    );
  }

  const techCoreName = techCores[techCoreId]?.name || techCoreId;
  const suffix = whatIf.isActive ? ' (projected)' : '';

  const bars = [
    { 
      label: `Credit Hours${suffix}`, 
      completed: progress.totalHours, 
      total: progress.totalHoursTarget, 
      unit: 'hrs', 
      icon: BookOpen 
    },
    { 
      label: `ECE Core${suffix}`, 
      completed: progress.eceCoreCompleted, 
      total: progress.eceCoreTotal, 
      unit: 'courses', 
      icon: GraduationCap 
    },
    { 
      label: `Gen Ed${suffix}`, 
      completed: progress.genEdCompleted, 
      total: progress.genEdTotal, 
      unit: 'courses', 
      icon: Award 
    },
    { 
      label: `Tech Core: ${techCoreName}${suffix}`, 
      completed: progress.techCoreCompleted, 
      total: progress.techCoreTotal, 
      unit: 'courses', 
      icon: Cpu 
    },
    { 
      label: `Electives${suffix}`, 
      completed: progress.electiveHours, 
      total: progress.electiveTotalHours, 
      unit: 'hrs', 
      icon: Star 
    },
  ];

  if (mathBAToggle && progress.mathBATotal) {
    bars.push({
      label: `Math BA Additional${suffix}`,
      completed: progress.mathBACompleted || 0,
      total: progress.mathBATotal,
      unit: 'courses',
      icon: Calculator
    });
  }

  return (
    <div className={cn(
      "px-4 py-3 border-b overflow-x-auto transition-colors",
      whatIf.isActive ? "bg-yellow-500/10 border-yellow-500/30" : "bg-muted/20 border-border"
    )}>
      {whatIf.isActive && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <Zap className="h-3 w-3 text-yellow-600 fill-yellow-600" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-700 dark:text-yellow-500">
            Simulation Mode Active
          </span>
        </div>
      )}
      <div className="flex flex-col gap-2 min-w-[600px]">
        {bars.map((bar) => {
          const percentage = Math.min(100, Math.round((bar.completed / (bar.total || 1)) * 100));
          
          let colorClass = '[&>div]:bg-red-500';
          if (percentage >= 100) colorClass = '[&>div]:bg-green-500';
          else if (percentage >= 80) colorClass = '[&>div]:bg-blue-500';
          else if (percentage >= 50) colorClass = '[&>div]:bg-yellow-500';

          return (
            <div key={bar.label} className="flex items-center gap-4">
              <div className="flex items-center gap-2 w-52 shrink-0">
                <bar.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold truncate">{bar.label}</span>
              </div>
              <Progress value={percentage} className={cn("h-2 flex-1", colorClass)} />
              <div className="flex items-center justify-end gap-3 w-40 shrink-0">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {bar.completed} / {bar.total} {bar.unit}
                </span>
                <span className="text-xs font-bold w-10 text-right tabular-nums">
                  {percentage}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
