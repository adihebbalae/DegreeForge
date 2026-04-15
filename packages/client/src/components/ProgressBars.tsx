import React, { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { usePlan } from '@/context/PlanContext';
import { 
  useCatalogRecord, 
  usePrereqGraph, 
  useDegreeRequirements, 
  useUserProfile, 
  useTechCoresRecord 
} from '@/context/DataContext';
import { computeProgress } from '@/lib/progress';
import { BookOpen, GraduationCap, Award, Cpu, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PrereqNode } from '@/types';

export function ProgressBars() {
  const plan = usePlan();
  const catalog = useCatalogRecord();
  const prereqGraph = usePrereqGraph();
  const degreeReqs = useDegreeRequirements();
  const profile = useUserProfile();
  const techCores = useTechCoresRecord();

  const prereqNodes: Record<string, PrereqNode> = prereqGraph?.nodes ?? {};

  const progress = useMemo(() => {
    if (!catalog || !prereqNodes || !degreeReqs || !profile || !techCores) return null;
    
    // Find Adi's tech core track
    const trackSlug = Object.keys(techCores).find(
      (key) => techCores[key].name === profile.tech_core.declared
    ) || 'computer_architecture';
    const techCore = techCores[trackSlug];

    return computeProgress(plan, profile, catalog, prereqNodes, degreeReqs, techCore);
  }, [plan, catalog, prereqNodes, degreeReqs, profile, techCores]);

  if (!progress || !profile) {
    return (
      <div className="px-4 py-2 border-b bg-muted/10">
        <div className="h-20 animate-pulse bg-muted/20 rounded-md" />
      </div>
    );
  }

  const bars = [
    { 
      label: 'Credit Hours', 
      completed: progress.totalHours, 
      total: progress.totalHoursTarget, 
      unit: 'hrs', 
      icon: BookOpen 
    },
    { 
      label: 'ECE Core', 
      completed: progress.eceCoreCompleted, 
      total: progress.eceCoreTotal, 
      unit: 'courses', 
      icon: GraduationCap 
    },
    { 
      label: 'Gen Ed', 
      completed: progress.genEdCompleted, 
      total: progress.genEdTotal, 
      unit: 'courses', 
      icon: Award 
    },
    { 
      label: `Tech Core (${profile.tech_core.declared})`, 
      completed: progress.techCoreCompleted, 
      total: progress.techCoreTotal, 
      unit: 'courses', 
      icon: Cpu 
    },
    { 
      label: 'Electives', 
      completed: progress.electiveHours, 
      total: progress.electiveTotalHours, 
      unit: 'hrs', 
      icon: Star 
    },
  ];

  return (
    <div className="px-4 py-3 border-b bg-muted/20 overflow-x-auto">
      <div className="flex flex-col gap-2 min-w-[600px]">
        {bars.map((bar) => {
          const percentage = Math.min(100, Math.round((bar.completed / (bar.total || 1)) * 100));
          
          let colorClass = '[&>div]:bg-red-500';
          if (percentage >= 100) colorClass = '[&>div]:bg-green-500';
          else if (percentage >= 80) colorClass = '[&>div]:bg-blue-500';
          else if (percentage >= 50) colorClass = '[&>div]:bg-yellow-500';

          return (
            <div key={bar.label} className="flex items-center gap-4">
              <div className="flex items-center gap-2 w-48 shrink-0">
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
