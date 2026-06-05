import { Check, X, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProposedPlanEdit, PlanEditOperation } from '@/lib/agent-tools/types';

function operationLabel(op: PlanEditOperation): string {
  if (op.op === 'add') return `Add ${op.courseId} → ${op.semesterId}`;
  if (op.op === 'remove') return `Remove ${op.courseId} from ${op.semesterId}`;
  if (op.op === 'move') return `Move ${op.courseId}: ${op.fromSemesterId} → ${op.toSemesterId}`;
  return 'Unknown operation';
}

interface ProposalCardProps {
  proposal: ProposedPlanEdit;
  actedOps: Set<number>;
  opErrors: Record<number, string>;
  onAccept: (idx: number, op: PlanEditOperation) => void;
  onReject: (idx: number) => void;
  onPin: (idx: number, op: PlanEditOperation) => void;
}

export default function ProposalCard({ proposal, actedOps, opErrors, onAccept, onReject, onPin }: ProposalCardProps) {
  return (
    <div className="mt-2 border border-border rounded-lg overflow-hidden bg-background text-sm">
      <div className="px-3 py-2 bg-muted/60 border-b border-border font-semibold text-xs text-muted-foreground uppercase tracking-wide">
        Proposed Plan Changes
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
        {proposal.reasoning}
      </div>
      <ul className="divide-y divide-border">
        {proposal.operations.map((op, idx) => {
          const acted = actedOps.has(idx);
          const err = opErrors[idx];
          return (
            <li key={idx} className={`flex flex-col px-3 py-2 ${acted ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="flex-1 font-mono text-xs">{operationLabel(op)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                  disabled={acted}
                  onClick={() => onAccept(idx, op)}
                  title="Accept"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                  disabled={acted || op.op !== 'add'}
                  onClick={() => onPin(idx, op)}
                  title="Accept and Pin"
                >
                  <Pin className="w-3 h-3 mr-1" />
                  Pin
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  disabled={acted}
                  onClick={() => onReject(idx)}
                  title="Reject"
                >
                  <X className="w-3 h-3 mr-1" />
                  Reject
                </Button>
              </div>
              {err && (
                <p className="mt-1 text-xs text-red-500">{err}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
