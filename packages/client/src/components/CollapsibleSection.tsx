import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  /** Number shown in the count badge (remaining courses) */
  count: number;
  children: React.ReactNode;
  /** Whether the section starts expanded (default: true) */
  defaultOpen?: boolean;
}

/**
 * Reusable accordion section used by CoursePalette.
 *
 * Renders a clickable header with title + count badge, and an
 * animated content area that toggles on click.
 */
export default function CollapsibleSection({
  title,
  count,
  children,
  defaultOpen = true,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-0.5">
      {/* ── Section header ───────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded-md',
          'hover:bg-muted/60 transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
        )}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="text-xs font-semibold text-foreground flex-1 leading-tight">
          {title}
        </span>

        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full leading-tight shrink-0">
          {count}
        </span>
      </button>

      {/* ── Content ──────────────────────────────────────────────────── */}
      {open && (
        <div className="mt-0.5 space-y-1 pl-1.5 pr-1 pb-1">
          {children}
        </div>
      )}
    </div>
  );
}
