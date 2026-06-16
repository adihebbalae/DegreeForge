/**
 * FeedbackWidget — a small, persistent floating feedback button + popover.
 *
 * Mounted once at the app root (Layout.tsx) so it renders on every route and on
 * both the desktop shell and the mobile minimalist shell. Clicking the low-contrast
 * button opens a lightweight popover where the user reports a Bug or suggests an
 * Idea, optionally leaves an email, and submits. Submission fires exactly one
 * `feedback_submitted` PostHog event via the existing `track()` helper, then shows
 * a brief confirmation and closes — no reload, no navigation.
 *
 * PRIVACY: the payload is ONLY the typed text plus benign technical metadata
 * (type, route, viewport, isMobile, appVersion, userAgent, optional email). It
 * NEVER includes plan, course, grade, or profile data — those values are promised
 * to stay on the user's device.
 *
 * Uses the shadcn Dialog primitive (not PostHog Surveys) for full payload + layout
 * control; Dialog gives Esc / click-outside / X close and focus management for free.
 */

import { useState, useCallback, useEffect } from 'react'
import { MessageSquare } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { track } from '@/lib/analytics'

type FeedbackType = 'bug' | 'idea'

// Same breakpoint the app uses to choose the mobile (minimalist) shell.
const MOBILE_QUERY = '(max-width: 767px)'

// Light, non-blocking format sanity for the optional email — keeps obvious typos
// out without rejecting anything a user is willing to type. Real validation is
// not in scope (it's optional contact info, not an auth field).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function FeedbackWidget() {
  const isMobile = useMediaQuery(MOBILE_QUERY)

  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>('bug')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const resetForm = useCallback(() => {
    setType('bug')
    setMessage('')
    setEmail('')
    setSubmitted(false)
  }, [])

  // When the dialog closes (Esc / click-outside / X / post-submit), reset for next time.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) resetForm()
    },
    [resetForm],
  )

  // After showing the "Thanks, got it" confirmation, auto-close shortly.
  useEffect(() => {
    if (!submitted) return
    const t = setTimeout(() => handleOpenChange(false), 1400)
    return () => clearTimeout(t)
  }, [submitted, handleOpenChange])

  const trimmed = message.trim()
  const canSubmit = trimmed.length > 0

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return

    const trimmedEmail = email.trim()

    const payload: Record<string, unknown> = {
      type,
      message: trimmed,
      route: window.location.pathname,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      isMobile,
      appVersion: __APP_VERSION__,
      userAgent: navigator.userAgent,
    }
    // Include the email key ONLY when the user actually provided one.
    if (trimmedEmail && EMAIL_RE.test(trimmedEmail)) {
      payload.email = trimmedEmail
    }

    track('feedback_submitted', payload)
    setSubmitted(true)
  }, [canSubmit, type, trimmed, email, isMobile])

  return (
    <>
      {/* Floating trigger — low-contrast, fixed bottom-right on every route/shell.
          On mobile it is bumped up (bottom-20) so it never sits over the bottom of
          the minimalist shell's content / action affordances. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        data-testid="feedback-button"
        className={cn(
          'fixed right-4 bottom-4 z-50 max-md:bottom-20',
          'flex h-10 w-10 items-center justify-center rounded-full',
          'border border-border bg-background/80 text-muted-foreground shadow-sm backdrop-blur',
          'transition-colors hover:bg-accent hover:text-accent-foreground',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-sm gap-3 sm:left-auto sm:right-6 sm:top-auto sm:bottom-6 sm:translate-x-0 sm:translate-y-0 sm:rounded-lg"
          data-testid="feedback-popover"
        >
          {submitted ? (
            <div className="py-4 text-center" role="status" data-testid="feedback-confirmation">
              <DialogTitle className="text-base">Thanks, got it</DialogTitle>
              <DialogDescription className="mt-1">
                Your feedback was sent. Thanks for helping make DegreeForge better.
              </DialogDescription>
            </div>
          ) : (
            <>
              <DialogTitle className="text-base">Send feedback</DialogTitle>
              <DialogDescription className="sr-only">
                Report a bug or suggest an idea. Optionally leave an email for a reply.
              </DialogDescription>

              {/* Bug / Idea segmented toggle (default: bug). */}
              <div
                role="radiogroup"
                aria-label="Feedback type"
                className="inline-flex w-full rounded-md border border-border p-0.5"
              >
                {(['bug', 'idea'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={type === value}
                    onClick={() => setType(value)}
                    className={cn(
                      'flex-1 rounded-[5px] px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      type === value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>

              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What went wrong, or what would you add?"
                aria-label="Feedback message"
                rows={4}
                autoFocus
              />

              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email if you want a reply (optional)"
                aria-label="Email (optional)"
              />

              <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="w-full">
                Submit
              </Button>
            </>
          )}
          {/* DialogContent renders its own top-right X close (closes on Esc + click-outside too). */}
        </DialogContent>
      </Dialog>
    </>
  )
}
