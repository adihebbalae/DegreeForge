import { useComparisonMode } from '@/context/PlanContext';
import { SnapshotSidebar } from './SnapshotSidebar';
import { SplitView } from './SplitView';

export * from './ComparisonToggle';

export function PlanComparisonPanel() {
  const mode = useComparisonMode();

  if (mode === 'off') return null;

  if (mode === 'split-view') {
    return <SplitView />;
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 z-30 shadow-2xl">
      <SnapshotSidebar />
    </div>
  );
}
