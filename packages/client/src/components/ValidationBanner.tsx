import { AlertTriangle } from 'lucide-react';
import { useValidation } from '@/hooks/useValidation';
import { cn } from '@/lib/utils';

export default function ValidationBanner() {
  const { violations, hasViolations } = useValidation();

  if (!hasViolations) return null;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400"
    )}>
      <AlertTriangle className="h-3.5 w-3.5" />
      <span>
        {violations.length} prerequisite issue{violations.length === 1 ? '' : 's'} in your plan
      </span>
      <span className="ml-auto text-[10px] uppercase font-bold tracking-wider opacity-70">
        Review red/orange cards
      </span>
    </div>
  );
}
