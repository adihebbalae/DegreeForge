import { useComparisonMode, useSnapshotDispatch } from '@/context/PlanContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ComparisonToggle() {
  const mode = useComparisonMode();
  const dispatch = useSnapshotDispatch();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Compare:</span>
      <Select 
        value={mode} 
        onValueChange={(val: 'off' | 'sidebar-diff' | 'split-view') => 
          dispatch({ type: 'SET_COMPARISON_MODE', mode: val })
        }
      >
        <SelectTrigger className="w-[140px] h-8">
          <SelectValue placeholder="Mode" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="off">Off</SelectItem>
          <SelectItem value="sidebar-diff">Sidebar Diff</SelectItem>
          <SelectItem value="split-view">Split View</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
