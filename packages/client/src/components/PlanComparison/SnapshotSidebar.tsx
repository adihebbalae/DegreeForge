import { useState } from 'react';
import { useSnapshots, useSnapshotDispatch, usePlan, usePlanDispatch } from '@/context/PlanContext';
import { computePlanDiff } from '@/lib/plan-diff';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Save, Trash2, Edit2, Play } from 'lucide-react';

export function SnapshotSidebar() {
  const snapshots = useSnapshots();
  const currentPlan = usePlan();
  const dispatch = useSnapshotDispatch();
  const planDispatch = usePlanDispatch();

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const commitRename = (id: string, name: string) => {
    dispatch({ type: 'RENAME_SNAPSHOT', id, name });
    setEditingId(null);
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const handleSave = () => {
    dispatch({ type: 'SAVE_SNAPSHOT', plan: currentPlan });
  };

  const handleLoad = (id: string) => {
    const snap = snapshots.find(s => s.id === id);
    if (snap) {
      planDispatch({ type: 'SET_PLAN', plan: snap.plan });
    }
  };

  let diffResult = null;
  if (compareIds.length === 2) {
    const planA = snapshots.find(s => s.id === compareIds[0])?.plan || {};
    const planB = snapshots.find(s => s.id === compareIds[1])?.plan || {};
    diffResult = computePlanDiff(planA, planB);
  } else if (compareIds.length === 1) {
    const planA = snapshots.find(s => s.id === compareIds[0])?.plan || {};
    diffResult = computePlanDiff(planA, currentPlan);
  }

  return (
    <div className="w-80 h-full border-l bg-card flex flex-col">
      <div className="p-4 border-b flex justify-between items-center">
        <h3 className="font-semibold">Snapshots</h3>
        <Button size="sm" onClick={handleSave} disabled={snapshots.length >= 3}>
          <Save className="w-4 h-4 mr-2" /> Save
        </Button>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {snapshots.map(snap => (
            <div key={snap.id} className="border rounded-md p-3 space-y-3">
              <div className="flex justify-between items-center">
                {editingId === snap.id ? (
                  <Input
                    value={editName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
                    onBlur={() => commitRename(snap.id, editName)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter') commitRename(snap.id, editName);
                    }}
                    autoFocus
                    className="h-7 text-sm"
                  />
                ) : (
                  <span className="font-medium text-sm flex-1">{snap.name}</span>
                )}
                
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                    setEditName(snap.name);
                    setEditingId(snap.id);
                  }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => dispatch({ type: 'DELETE_SNAPSHOT', id: snap.id })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(snap.createdAt).toLocaleDateString()}</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <Checkbox 
                      checked={compareIds.includes(snap.id)} 
                      onCheckedChange={() => toggleCompare(snap.id)}
                    /> Compare
                  </label>
                  <Button size="sm" variant="secondary" className="h-6 px-2 text-xs" onClick={() => handleLoad(snap.id)}>
                    <Play className="w-3 h-3 mr-1" /> Load
                  </Button>
                </div>
              </div>
            </div>
          ))}
          
          {snapshots.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              No snapshots saved yet.
            </div>
          )}
        </div>

        {diffResult && (
          <div className="mt-6 space-y-3">
            <Separator />
            <h4 className="font-medium text-sm">Comparison Results</h4>
            
            {diffResult.added.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-green-500">Added:</span>
                <ul className="text-xs space-y-1 mt-1">
                  {diffResult.added.map(c => <li key={c.courseId}>+ {c.courseId} ({c.semester})</li>)}
                </ul>
              </div>
            )}
            
            {diffResult.removed.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-red-500">Removed:</span>
                <ul className="text-xs space-y-1 mt-1">
                  {diffResult.removed.map(c => <li key={c.courseId}>- {c.courseId} ({c.semester})</li>)}
                </ul>
              </div>
            )}
            
            {diffResult.moved.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-blue-500">Moved:</span>
                <ul className="text-xs space-y-1 mt-1">
                  {diffResult.moved.map(c => <li key={c.courseId}>~ {c.courseId} ({c.fromSemester} → {c.toSemester})</li>)}
                </ul>
              </div>
            )}

            {diffResult.added.length === 0 && diffResult.removed.length === 0 && diffResult.moved.length === 0 && (
              <div className="text-xs text-muted-foreground">Plans are identical.</div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
