import React, { useMemo } from 'react';
import { X, Zap, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  usePlanDispatch,
  usePlan,
  useWhatIf,
  useTechCoreId,
  useMathBAToggle,
} from '@/context/PlanContext';
import {
  useTechCores,
  useTechCoresRecord,
  useMathRequirements,
  useCatalogRecord,
  useUserProfile,
} from '@/context/DataContext';
import { computeWhatIfDiff } from '@/lib/what-if';
import { TechCoreTrack } from '@/types';


interface WhatIfPanelProps {
  onClose: () => void;
}

export default function WhatIfPanel({ onClose }: WhatIfPanelProps) {
  const dispatch = usePlanDispatch();
  const plan = usePlan();
  const whatIf = useWhatIf();
  const currentTechCoreId = useTechCoreId();
  const currentMathBA = useMathBAToggle();

  const techCores = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const catalog = useCatalogRecord();
  const profile = useUserProfile();

  const techCoreList = (Object.entries(techCores || {}) as [string, TechCoreTrack][]).map(([id, track]) => ({
    id,
    name: track.name,
  }));

  const completedCourses = useMemo(() => [
    ...(profile?.completed_courses?.map(c => c.course) || []),
    ...(profile?.in_progress_courses?.map(c => c.course) || []),
  ], [profile]);

  const diff = useMemo(() => {
    if (!techCores || !mathReqs || !catalog) return null;
    
    return computeWhatIfDiff(
      { techCoreId: currentTechCoreId, mathBAToggle: currentMathBA },
      { techCoreId: whatIf.techCoreId, mathBAToggle: whatIf.mathBAToggle },
      techCores,
      mathReqs,
      catalog,
      completedCourses
    );
  }, [
    currentTechCoreId, 
    currentMathBA, 
    whatIf.techCoreId, 
    whatIf.mathBAToggle, 
    techCores, 
    mathReqs, 
    catalog, 
    completedCourses
  ]);

  const handleApply = () => {
    // For now, we'll just update the settings. 
    // In a full implementation, this would call generatePlan()
    // to redistribute courses.
    
    // Minimal "solver" replacement:
    // Just update the settings and let the user handle the palette updates.
    // The palette will show new courses that are now required.
    
    const newPlan = { ...plan };
    // TODO: Actually implement the redistribution logic if required by TASK-004
    
    dispatch({ type: 'APPLY_WHAT_IF', newPlan });
    onClose();
  };

  const handleCancel = () => {
    dispatch({ type: 'RESET_WHAT_IF' });
    onClose();
  };

  if (!techCores || !mathReqs) return null;

  return (
    <div className="flex flex-col h-full bg-background border-l border-border shadow-lg w-80">
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500 fill-yellow-500" />
          <span className="font-bold">What-If Simulator</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* ── Configuration ────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tech-core">Tech Core Track</Label>
              <Select
                value={whatIf.techCoreId}
                onValueChange={(val) => dispatch({ type: 'SET_TECH_CORE', techCoreId: val })}
              >
                <SelectTrigger id="tech-core">
                  <SelectValue placeholder="Select track" />
                </SelectTrigger>
                <SelectContent>
                  {techCoreList.map((track) => (
                    <SelectItem key={track.id} value={track.id}>
                      {track.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="math-ba">Math BA Double Major</Label>
                <p className="text-xs text-muted-foreground">Consider Math BA requirements</p>
              </div>
              <Switch
                id="math-ba"
                checked={whatIf.mathBAToggle}
                onCheckedChange={(checked) => dispatch({ type: 'TOGGLE_MATH_BA', enabled: checked })}
              />
            </div>
          </div>

          <Separator />

          {/* ── Impact Preview ───────────────────────────────────────────── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Impact Preview
            </h3>

            {diff && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Card className="bg-muted/20 border-none shadow-none">
                    <CardContent className="p-3 pt-3 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-green-600">
                        {diff.creditHourDelta > 0 ? `+${diff.creditHourDelta}` : diff.creditHourDelta}
                      </span>
                      <span className="text-[10px] uppercase text-muted-foreground font-medium">
                        Credit Hours
                      </span>
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/20 border-none shadow-none">
                    <CardContent className="p-3 pt-3 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-blue-600">
                        {diff.semesterDelta > 0 ? `+${diff.semesterDelta}` : diff.semesterDelta}
                      </span>
                      <span className="text-[10px] uppercase text-muted-foreground font-medium">
                        Semesters
                      </span>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-3">
                  {diff.coursesAdded.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-green-700 dark:text-green-400">
                        Courses Added ({diff.coursesAdded.length})
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {diff.coursesAdded.map(id => (
                          <Badge key={id} variant="secondary" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300">
                            {id}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {diff.coursesRemoved.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-red-700 dark:text-red-400">
                        Courses Removed ({diff.coursesRemoved.length})
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {diff.coursesRemoved.map(id => (
                          <Badge key={id} variant="secondary" className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300">
                            {id}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {diff.coursesAdded.length === 0 && diff.coursesRemoved.length === 0 && (
                    <p className="text-xs text-center text-muted-foreground py-4 italic">
                      No course changes identified
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border bg-muted/20 space-y-2">
        <Button 
          className="w-full gap-2" 
          onClick={handleApply}
          disabled={!whatIf.isActive}
        >
          <Check className="h-4 w-4" />
          Apply to Plan
        </Button>
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={handleCancel}
        >
          Cancel Simulation
        </Button>
      </div>
    </div>
  );
}
