/**
 * FocusTabbedPanel — TASK-094
 *
 * Right-panel "Tabbed" layout for the FocusEditor.
 * Three tabs: Insights | Add | Best Path
 *   - Insights and Add reuse FocusInsightsPanel and FocusAddPanel.
 *   - Best Path renders the full critical path + bottlenecks via BestPathContent.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useDiagnostics } from '@/hooks/useDiagnostics';
import BestPathContent from '@/components/BestPathContent';
import FocusInsightsPanel from './FocusInsightsPanel';
import FocusAddPanel from './FocusAddPanel';
import type { Semester } from '@/types';

type Tab = 'insights' | 'add' | 'bestpath';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'insights', label: 'Insights' },
  { id: 'add', label: 'Add' },
  { id: 'bestpath', label: 'Best Path' },
];

interface FocusTabbedPanelProps {
  semester: Semester;
  creditHourCap: number;
}

export default function FocusTabbedPanel({ semester, creditHourCap }: FocusTabbedPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('insights');
  const diagnostics = useDiagnostics();

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Tab bar — role="button" + aria-pressed matches the outer layout switcher in FocusEditor */}
      <div className="flex shrink-0 border-b border-border px-2 pt-1 gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-t transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              activeTab === tab.id
                ? 'bg-background border border-border border-b-background text-foreground -mb-px'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'insights' && (
          <FocusInsightsPanel semester={semester} creditHourCap={creditHourCap} />
        )}
        {activeTab === 'add' && (
          <FocusAddPanel semester={semester} />
        )}
        {activeTab === 'bestpath' && (
          <BestPathTab diagnostics={diagnostics} />
        )}
      </div>
    </div>
  );
}

// ── Best Path tab content ──────────────────────────────────────────────────────

function BestPathTab({ diagnostics }: { diagnostics: ReturnType<typeof useDiagnostics> }) {
  if (!diagnostics) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        Loading diagnostics…
      </div>
    );
  }

  const { criticalPath, bottlenecks } = diagnostics;
  const hasCriticalPath = criticalPath.chain.length > 0;
  const hasBottlenecks = bottlenecks.length > 0;

  if (!hasCriticalPath && !hasBottlenecks) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        No critical-path constraints found.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3">
      <BestPathContent criticalPath={criticalPath} bottlenecks={bottlenecks} />
    </div>
  );
}
