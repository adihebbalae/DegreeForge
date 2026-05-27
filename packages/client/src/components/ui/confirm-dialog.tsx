import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Short headline — what action is about to happen. */
  title: string
  /**
   * The *specific numerical consequence* of confirming, e.g.:
   *   "Removes 14 courses across 6 semesters. Completed courses are preserved."
   * Must not be generic ("Are you sure?").
   */
  consequence: string
  /** Label for the confirm button — a destructive verb, not "OK" or "Yes". */
  confirmLabel: string
  /** Called when the user clicks the confirm button. */
  onConfirm: () => void
  /** Whether the confirm action is destructive (renders button in red). Defaults to true. */
  destructive?: boolean
}

/**
 * ConfirmDialog — replaces native browser confirmation dialogs.
 *
 * Voice contract: `consequence` must name the specific numerical impact.
 * `confirmLabel` must be a verb (e.g. "Reset Plan", "Overwrite Courses").
 * No emoji, no exclamation marks, no generic "Are you sure?" text.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel,
  onConfirm,
  destructive = true,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{consequence}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            aria-label={confirmLabel}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
