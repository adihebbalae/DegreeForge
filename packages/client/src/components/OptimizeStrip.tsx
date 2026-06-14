/**
 * OptimizeStrip — TASK-073 / TASK-093
 *
 * A slim full-width strip directly below the header that hosts the Fastest/Easiest
 * toggle and the difficulty / GPA / graduation-term readout on the left, and a
 * right-aligned controls cluster (Compare, Courses, Best Path) on the right.
 *
 * TASK-093: Compare and Courses moved here from the overview toolbar row in
 * PlannerPage (saving one 32px strip). Best Path popover added at the far right
 * (zero vertical cost while closed).
 */

import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUi } from '@/context/UiContext';
import PlanOptimizeControl from './PlanOptimizeControl';
import { ComparisonToggle } from './PlanComparison/ComparisonToggle';
import BestPathPopover from './BestPathPopover';

export default function OptimizeStrip() {
  const { paletteOpen, setPaletteOpen } = useUi();

  return (
    <div
      className="h-7 min-h-7 border-b border-border bg-muted/30 flex items-center justify-between px-4"
      data-testid="optimize-strip"
    >
      <PlanOptimizeControl />

      {/* Right-aligned cluster: Compare dropdown + Courses button + Best Path popover */}
      <div className="flex items-center gap-1.5">
        <ComparisonToggle />
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 gap-1 text-[11px]"
          onClick={() => setPaletteOpen((v) => !v)}
          aria-label="Toggle course palette"
          aria-expanded={paletteOpen}
        >
          <BookOpen className="h-3 w-3" />
          Courses
        </Button>
        <BestPathPopover />
      </div>
    </div>
  );
}
