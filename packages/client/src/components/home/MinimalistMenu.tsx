/**
 * MinimalistMenu — the single "≡" overflow menu for the minimalist shell.
 *
 * Holds everything that isn't the plan canvas or the Fastest/Easiest control:
 * Chat, What-If, Course palette, Recommend, Compare, Schedule, Settings,
 * Export, Import, Help. Built on the existing DropdownMenu primitive so it works
 * with keyboard + touch and matches the rest of the app.
 *
 * Actions are wired to the same context the planner uses (UiContext panels,
 * useRecommendPlan, snapshot comparison mode, router nav, usePlanIO for files).
 * The trade-off the design flags — feature discovery dropping behind a hamburger —
 * is mitigated by the Help item, which explains where each tool lives.
 */

import { useNavigate } from 'react-router-dom';
import {
  Menu,
  MessageSquare,
  Zap,
  BookOpen,
  Wand2,
  GitCompare,
  Settings,
  Download,
  Upload,
  FileText,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUi } from '@/context/UiContext';
import { useSnapshotDispatch } from '@/context/PlanContext';
import { AI_ENABLED } from '@/lib/features';
import type { PlanIO } from './usePlanIO';

interface MinimalistMenuProps {
  /** From useRecommendPlan() — triggers a solver-optimized plan run. */
  onRecommend: () => void;
  /** Export/import wiring (shares the file input rendered by HomeMinimalist). */
  planIO: PlanIO;
  /** Opens the inline help dialog. */
  onOpenHelp: () => void;
  /** Opens the transcript/IDA import wizard (distinct from JSON snapshot import). */
  onImportTranscript: () => void;
}

export default function MinimalistMenu({ onRecommend, planIO, onOpenHelp, onImportTranscript }: MinimalistMenuProps) {
  const navigate = useNavigate();
  const { setChatOpen, setWhatIfOpen, setPaletteOpen } = useUi();
  const snapshotDispatch = useSnapshotDispatch();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          // ≥44px touch target.
          className="h-11 w-11"
          aria-label="Menu"
          data-testid="minimalist-menu-trigger"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Tools</DropdownMenuLabel>
        {/* AI hidden for soft launch — re-enable by setting AI_ENABLED=true in lib/features.ts */}
        {AI_ENABLED && (
          <DropdownMenuItem onSelect={() => setChatOpen(true)}>
            <MessageSquare className="h-4 w-4" />
            Chat
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => setWhatIfOpen(true)}>
          <Zap className="h-4 w-4" />
          What-If
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setPaletteOpen(true)}>
          <BookOpen className="h-4 w-4" />
          Course palette
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRecommend}>
          <Wand2 className="h-4 w-4" />
          Recommend plan
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => snapshotDispatch({ type: 'SET_COMPARISON_MODE', mode: 'sidebar-diff' })}
        >
          <GitCompare className="h-4 w-4" />
          Compare
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Schedule + Career disabled for alpha launch — components retained; re-enable by restoring the nav link + route element. */}
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings className="h-4 w-4" />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={onImportTranscript}>
          <FileText className="h-4 w-4" />
          Import transcript / audit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={planIO.exportPlan}>
          <Download className="h-4 w-4" />
          Export plan
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={planIO.openImport}>
          <Upload className="h-4 w-4" />
          Import plan snapshot (.json)
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={onOpenHelp}>
          <HelpCircle className="h-4 w-4" />
          Help
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
