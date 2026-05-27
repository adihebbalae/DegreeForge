import { useState } from 'react';
import { useSnapshots, usePlan, useSemesters } from '@/context/PlanContext';
import { computePlanDiff, type PlanDiff } from '@/lib/plan-diff';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ComparisonToggle } from './ComparisonToggle';

export function SplitView() {
  const snapshots = useSnapshots();
  const currentPlan = usePlan();
  const semesters = useSemesters();

  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  // Use the selected snapshot, falling back to the first available snapshot.
  const rightSnapshot = selectedSnapshotId
    ? (snapshots.find(s => s.id === selectedSnapshotId) ?? snapshots[0])
    : snapshots[0];
  const planA = currentPlan;
  const planB = rightSnapshot?.plan || {};
  
  const diff = computePlanDiff(planA, planB);

  const getCourseStyle = (courseId: string, diff: PlanDiff, planSide: 'left' | 'right') => {
    // left: planA. right: planB.
    // added (in B not A) -> green in right
    // removed (in A not B) -> red in left
    // moved -> blue in both
    if (diff.moved.some(m => m.courseId === courseId)) return 'border-blue-500 bg-blue-500/10 text-blue-700';
    
    if (planSide === 'left') {
      if (diff.removed.some(m => m.courseId === courseId)) return 'border-red-500 bg-red-500/10 text-red-700';
    } else {
      if (diff.added.some(m => m.courseId === courseId)) return 'border-green-500 bg-green-500/10 text-green-700';
    }
    
    return 'bg-background';
  };

  const renderPlan = (plan: Record<string, string[]>, side: 'left' | 'right', title: string) => (
    <div className="flex-1 border rounded-md bg-card overflow-hidden flex flex-col">
      <div className="p-3 border-b bg-muted/50 font-semibold text-sm">{title}</div>
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {semesters.map(sem => {
            const courses = plan[sem.id] || [];
            if (courses.length === 0) return null;
            return (
              <div key={sem.id} className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">{sem.label}</h4>
                <div className="space-y-1.5">
                  {courses.map(c => (
                    <div 
                      key={c} 
                      className={`text-sm p-2 border rounded-md ${getCourseStyle(c, diff, side)}`}
                    >
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <div className="absolute inset-0 z-40 bg-background/95 backdrop-blur-sm p-6 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">Split View Comparison</h2>
          <ComparisonToggle />
        </div>
        {snapshots.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Right side:</span>
            <Select
              value={selectedSnapshotId ?? snapshots[0]?.id ?? ''}
              onValueChange={(val) => setSelectedSnapshotId(val)}
            >
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue placeholder="Select snapshot" />
              </SelectTrigger>
              <SelectContent>
                {snapshots.map(snap => (
                  <SelectItem key={snap.id} value={snap.id}>{snap.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex-1 flex gap-6 h-full overflow-hidden">
        {renderPlan(planA, 'left', 'Current Plan')}
        {renderPlan(planB, 'right', rightSnapshot ? rightSnapshot.name : 'No Snapshot')}
      </div>
    </div>
  );
}
