import { useComparisonMode, useSnapshotDispatch } from '@/context/PlanContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ComparisonToggle() {
  const mode = useComparisonMode();
  const dispatch = useSnapshotDispatch();

  return (
    <Select
      value={mode}
      onValueChange={(val: string) => {
        if (val === 'off' || val === 'sidebar-diff' || val === 'split-view') {
          dispatch({ type: 'SET_COMPARISON_MODE', mode: val });
        }
      }}
    >
      <SelectTrigger className="w-[110px] h-6 text-[11px]">
        <SelectValue placeholder="Compare" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="off">Off</SelectItem>
        <SelectItem value="sidebar-diff">Sidebar Diff</SelectItem>
        <SelectItem value="split-view">Split View</SelectItem>
      </SelectContent>
    </Select>
  );
}
