/**
 * FocusTabbedPanel — TASK-094
 *
 * The right-panel content host for the FocusEditor.
 * Three tabs: Insights | Add | Best Path
 *   - Insights and Add reuse FocusInsightsPanel and FocusAddPanel.
 *   - Best Path renders the full critical path + bottlenecks via BestPathContent.
 *
 * The active tab can be controlled (pass `activeTab` + `onTabChange`) so the host
 * can jump to a specific tab — e.g. the "+ Add course" header button selects 'add'.
 * When uncontrolled it manages its own state, defaulting to 'insights'.
 *
 * `headless` (TASK-1xx focus-layout): when true the panel renders ONLY the active
 * panel content and no tab bar — the host (FocusEditor) owns the tab buttons
 * inline in its header. The shared FocusTabStrip component renders those buttons
 * so the tablist/tab/aria-selected semantics stay identical in both locations.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useDiagnostics } from '@/hooks/useDiagnostics';
import BestPathContent from '@/components/BestPathContent';
import FocusInsightsPanel from './FocusInsightsPanel';
import FocusAddPanel from './FocusAddPanel';
import type { Semester } from '@/types';

export type FocusTab = 'insights' | 'add' | 'bestpath';

export const FOCUS_TABS: Array<{ id: FocusTab; label: string }> = [
  { id: 'insights', label: 'Insights' },
  { id: 'add', label: 'Add' },
  { id: 'bestpath', label: 'Best Path' },
];

// ── Shared segmented tab strip ──────────────────────────────────────────────
// Rendered either inside this panel (non-headless) or in the FocusEditor header
// (headless). Single source of truth for the tablist/tab a11y semantics.

interface FocusTabStripProps {
  activeTab: FocusTab;
  onSelect: (tab: FocusTab) => void;
  /** Compact segmented styling for the header row; default is the panel tab style. */
  variant?: 'panel' | 'segmented';
  className?: string;
}

export function FocusTabStrip({ activeTab, onSelect, variant = 'panel', className }: FocusTabStripProps) {
  if (variant === 'segmented') {
    return (
      <div role="tablist" aria-label="Focus panel" className={cn('inline-flex items-center rounded-md border border-border p-0.5 gap-0.5', className)}>
        {FOCUS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'px-2 py-0.5 text-xs font-medium rounded transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              activeTab === tab.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div role="tablist" aria-label="Focus panel" className={cn('flex border-b border-border px-2 pt-1 gap-0.5', className)}>
      {FOCUS_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onSelect(tab.id)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-t transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            activeTab === tab.id
              ? 'bg-background border border-border border-b-background text-foreground -mb-px'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface FocusTabbedPanelProps {
  semester: Semester;
  creditHourCap: number;
  /** Controlled active tab. Omit (with onTabChange) to use internal state. */
  activeTab?: FocusTab;
  /** Called when the user selects a tab. Required for controlled use. */
  onTabChange?: (tab: FocusTab) => void;
  /** When true, render only the active panel content (no tab bar). Default false. */
  headless?: boolean;
}

export default function FocusTabbedPanel({
  semester,
  creditHourCap,
  activeTab: controlledTab,
  onTabChange,
  headless = false,
}: FocusTabbedPanelProps) {
  const [internalTab, setInternalTab] = useState<FocusTab>('insights');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: FocusTab) => {
    if (controlledTab === undefined) setInternalTab(tab);
    onTabChange?.(tab);
  };
  const diagnostics = useDiagnostics();

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Tab bar — suppressed in headless mode (host renders the tabs inline) */}
      {!headless && (
        <FocusTabStrip activeTab={activeTab} onSelect={setActiveTab} variant="panel" />
      )}

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
