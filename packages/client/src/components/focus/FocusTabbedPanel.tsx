/**
 * FocusTabbedPanel — TASK-094
 *
 * Right-panel "Tabbed" layout for the FocusEditor.
 * Three tabs: Insights | Add | Best Path
 *   - Insights and Add reuse FocusInsightsPanel and FocusAddPanel.
 *   - Best Path renders the full critical path + bottlenecks (markup from BestPathPopover).
 */

import { useState } from 'react';
import { AlertTriangle, GitBranch, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDiagnostics } from '@/hooks/useDiagnostics';
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
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-border px-2 pt-1 gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-t transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              activeTab === tab.id
                ? 'bg-background border border-border border-b-background text-foreground -mb-px'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-selected={activeTab === tab.id}
            role="tab"
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
// Renders the full critical path + bottleneck list (same data as BestPathPopover).

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
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-4">
      {/* Critical path chain */}
      {hasCriticalPath && (
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <GitBranch className="h-3 w-3" aria-hidden="true" />
            Critical Path
          </h3>
          <div className="flex flex-wrap items-center gap-1">
            {criticalPath.chain.map((c, i) => (
              <span key={c.courseId} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="text-muted-foreground/50 text-[11px]" aria-hidden="true">
                    →
                  </span>
                )}
                <span
                  className={cn(
                    'text-[11px] font-mono px-1.5 py-0.5 rounded',
                    c.semesterId
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {c.courseId}
                </span>
              </span>
            ))}
          </div>
          {criticalPath.bottleneckSemesterId && (
            <p className="text-[10px] text-primary mt-1.5">
              Earliest graduation: {criticalPath.bottleneckSemesterId}
            </p>
          )}
        </section>
      )}

      {/* Bottleneck flags */}
      {hasBottlenecks && (
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Bottlenecks
          </h3>
          <ul className="flex flex-col gap-2">
            {bottlenecks.map((b) => (
              <li key={b.courseId} className="flex items-start gap-2">
                {b.slack === 0 ? (
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
                ) : (
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-foreground/80 leading-snug">{b.delayCost}</span>
                  <span className="text-[10px] text-muted-foreground leading-snug">{b.whyItMatters}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
