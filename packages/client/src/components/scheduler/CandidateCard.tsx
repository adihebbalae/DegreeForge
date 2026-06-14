import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { CandidateSchedule } from '@/lib/scheduler';
import { FACTOR_LABELS } from '@/lib/scheduler-settings';

interface CandidateCardProps {
  candidate: CandidateSchedule;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  whyOpen: boolean;
  onToggleWhy: () => void;
}

export default function CandidateCard({ candidate, index, isActive, onSelect, whyOpen, onToggleWhy }: CandidateCardProps) {
  const { factorScores, weights } = candidate;

  const totalWeight = weights
    ? (Object.values(weights) as number[]).reduce((s, w) => s + w, 0)
    : 1;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md border-2",
        isActive ? "border-primary shadow-sm" : "border-transparent"
      )}
      onClick={onSelect}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-primary">Option #{index + 1}</span>
          <div className="flex gap-1">
            <Badge className="bg-green-500 text-white text-[10px]">
              {candidate.avgGpa.toFixed(2)} GPA
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {(candidate.score * 100).toFixed(0)} pts
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {candidate.sections.map(s => (
            <span key={s.courseId} className="text-[10px] bg-muted px-1 rounded">
              {s.courseId}
            </span>
          ))}
        </div>

        {/* Why this schedule? */}
        {factorScores && weights && (
          <div>
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={e => { e.stopPropagation(); onToggleWhy(); }}
            >
              {whyOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Why this schedule?
            </button>

            {whyOpen && (
              <div className="mt-2 space-y-1 bg-muted/20 rounded p-2">
                {(Object.keys(factorScores) as Array<keyof typeof factorScores>).map(factor => {
                  const fScore = factorScores[factor];
                  const w = weights[factor];
                  const contribution = totalWeight > 0 ? (fScore * w) / totalWeight : 0;
                  return (
                    <div key={factor} className="flex items-center justify-between text-[9px] font-mono">
                      <span className="text-muted-foreground capitalize w-28 truncate">
                        {FACTOR_LABELS[factor]}
                      </span>
                      <span className="text-foreground">
                        {fScore.toFixed(2)} × {w.toFixed(2)} = {contribution.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
                <Separator className="my-1" />
                <div className="flex items-center justify-between text-[9px] font-mono font-bold">
                  <span>Composite</span>
                  <span>{candidate.score.toFixed(3)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
