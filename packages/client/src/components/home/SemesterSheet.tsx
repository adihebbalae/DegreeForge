/**
 * SemesterSheet — the slide-in editor for one semester in the minimalist shell.
 *
 * Built on the existing Radix Dialog primitive (no new dependency). It is styled
 * as a sheet, responsively:
 *   - <md: a bottom-sheet that fills the lower portion of the viewport (mobile-nav
 *     style), rounded top corners, full width.
 *   - md+: a right side-sheet (the desktop "side-sheet" the design calls for).
 *
 * The body reuses FocusEditor unchanged, so semester editing (drag/drop course
 * cards, pins, ghosts, prev/next nav) behaves identically to the planner. Opening
 * is driven by focusedSemesterId; closing clears it.
 */

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import FocusEditor from '@/components/FocusEditor';

interface SemesterSheetProps {
  /** The semester being edited, or null when the sheet is closed. */
  focusedSemesterId: string | null;
  onClose: () => void;
}

export default function SemesterSheet({ focusedSemesterId, onClose }: SemesterSheetProps) {
  const open = focusedSemesterId !== null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-black/50',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
        />
        <DialogPrimitive.Content
          data-testid="minimalist-semester-sheet"
          aria-label="Edit semester"
          className={cn(
            'fixed z-50 flex flex-col bg-background shadow-xl focus:outline-none',
            // Mobile: bottom-sheet (lower ~85% of viewport).
            'inset-x-0 bottom-0 h-[85dvh] rounded-t-2xl border-t border-border',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
            // md+: right side-sheet (full height, fixed width).
            'md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:h-full',
            'md:w-[min(560px,90vw)] md:rounded-none md:border-t-0 md:border-l',
            'md:data-[state=closed]:slide-out-to-right md:data-[state=open]:slide-in-from-right',
          )}
        >
          {/* Accessible title/description (visually hidden — FocusEditor renders
              its own visible header). Required by Radix Dialog for screen readers. */}
          <DialogPrimitive.Title className="sr-only">Edit semester</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            View and edit the courses planned for this semester.
          </DialogPrimitive.Description>

          {/* Grab handle (mobile affordance) */}
          <div className="md:hidden flex justify-center pt-2 shrink-0" aria-hidden="true">
            <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          </div>

          {focusedSemesterId !== null && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <FocusEditor focusedSemesterId={focusedSemesterId} onClose={onClose} />
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
