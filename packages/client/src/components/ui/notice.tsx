import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const noticeVariants = cva(
  'flex items-start gap-3 rounded-md border px-4 py-3 text-sm',
  {
    variants: {
      variant: {
        info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
        warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
        error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  }
)

const iconMap = {
  info: Info,
  warn: AlertTriangle,
  error: AlertCircle,
} as const

export interface NoticeAction {
  label: string
  onClick: () => void
  /** When true, renders as a deprioritised secondary action (ghost/link style) */
  secondary?: boolean
}

export interface NoticeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof noticeVariants> {
  /** The primary fact sentence. Must not be empty. */
  message: string
  /** Primary action (required verb label, e.g. "Open file again"). */
  action?: NoticeAction
  /** Optional secondary / lower-priority action. Rendered after the primary. */
  secondaryAction?: NoticeAction
  /** Called when the user dismisses (closes) the notice. Renders an X button when provided. */
  onDismiss?: () => void
}

/**
 * Notice — inline banner for info / warn / error messages.
 *
 * Voice contract: message is exactly 1 fact. Action labels are verbs, not affirmations.
 * No emoji, no exclamation marks, no apologies.
 */
const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(
  ({ className, variant = 'info', message, action, secondaryAction, onDismiss, ...props }, ref) => {
    const Icon = iconMap[variant ?? 'info']

    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn(noticeVariants({ variant }), className)}
        {...props}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="flex flex-1 flex-col gap-2">
          <p className="leading-snug">{message}</p>
          {(action || secondaryAction) && (
            <div className="flex flex-wrap gap-2">
              {action && (
                <Button
                  size="sm"
                  variant={variant === 'error' ? 'destructive' : 'default'}
                  className="h-7 px-3 text-xs"
                  onClick={action.onClick}
                  aria-label={action.label}
                >
                  {action.label}
                </Button>
              )}
              {secondaryAction && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-3 text-xs opacity-70"
                  onClick={secondaryAction.onClick}
                  aria-label={secondaryAction.label}
                >
                  {secondaryAction.label}
                </Button>
              )}
            </div>
          )}
        </div>
        {onDismiss && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0 -mr-1 opacity-60 hover:opacity-100"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    )
  }
)
Notice.displayName = 'Notice'

export { Notice, noticeVariants }
