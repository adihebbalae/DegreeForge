/**
 * WizardStepper — TASK-077 (Guided Wizard Hub)
 *
 * Presentational progress indicator for HomeWizardHub: a labelled step rail plus
 * a percentage progress bar. Stateless — the hub owns the current step and feeds
 * it in. Split out so the hub body stays focused on the step content.
 */

import { Progress } from '@/components/ui/progress';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WizardStepperProps {
  /** Short labels in order, e.g. ['Standing', 'Goal', 'Track', 'Review']. */
  steps: string[];
  /** 1-based index of the active step. */
  current: number;
}

export function WizardStepper({ steps, current }: WizardStepperProps) {
  const total = steps.length;
  const percent = Math.round((current / total) * 100);

  return (
    <div className="space-y-3">
      <ol className="flex items-center justify-between gap-1" aria-label="Setup progress">
        {steps.map((label, i) => {
          const n = i + 1;
          const isDone = n < current;
          const isActive = n === current;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                  isDone && 'border-primary bg-primary text-primary-foreground',
                  isActive && 'border-primary text-primary',
                  !isDone && !isActive && 'border-border text-muted-foreground'
                )}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
              </span>
              <span
                className={cn(
                  'truncate text-sm',
                  isActive ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <Progress value={percent} className="h-2" aria-label={`Step ${current} of ${total}`} />
    </div>
  );
}
