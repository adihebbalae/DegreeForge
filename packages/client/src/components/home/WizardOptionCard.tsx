/**
 * WizardOptionCard — TASK-077 (Guided Wizard Hub)
 *
 * A large, tappable single-choice card used for the wizard's "one decision per
 * screen" inputs. Renders as a radio so the whole group is keyboard- and
 * screen-reader-navigable. Kept generic (label + optional hint + optional icon)
 * so every step can reuse it instead of hand-rolling option markup.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface WizardOptionCardProps {
  /** Radio group name — same across a step's options so only one is selected. */
  name: string;
  /** Stable value for this option. */
  value: string;
  /** Whether this option is the current selection. */
  selected: boolean;
  /** Primary label. */
  label: string;
  /** Optional helper line under the label. */
  hint?: string;
  /** Optional leading icon. */
  icon?: ReactNode;
  onSelect: (value: string) => void;
}

export function WizardOptionCard({
  name,
  value,
  selected,
  label,
  hint,
  icon,
  onSelect,
}: WizardOptionCardProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border p-4 text-left transition-colors',
        'focus-within:ring-2 focus-within:ring-ring',
        selected ? 'border-primary bg-primary/10' : 'hover:bg-secondary'
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      {icon && (
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
            selected ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
