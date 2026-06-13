/**
 * LandingHero — TASK-076 (landing-dashboard variant, first-time visitor)
 *
 * Sells the wedge on first contact: the headline + one-line value prop, two
 * preview cards contrasting the Fastest vs Easiest (GPA) tradeoff, and the
 * onboarding CTAs.
 *
 * The two preview cards REUSE usePlanOptimizeSummary — the same live solver
 * readout the planner's OptimizeStrip shows — so the Fastest/Easiest numbers on
 * the landing page are real solver output, not marketing copy. While data loads
 * the cards show their static framing (semesters/peak) with em-dashes for the
 * computed figures rather than blocking the hero.
 *
 * CTAs route to the planner (/plan). The onboarding wizard lives above the home
 * route in the tree (main.tsx OnboardingGate), so this component cannot mount it
 * directly; routing to /plan is the unambiguous in-app destination.
 */

import { useNavigate } from 'react-router-dom';
import { GraduationCap, Gauge, Upload, Sparkles, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePlanOptimizeSummary } from '@/hooks/usePlanOptimizeSummary';
import { useSemesters } from '@/context/PlanContext';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { PlanDifficultySummary } from '@/lib/plan-objective';

function gradLabel(semesterId: string | null, labels: Map<string, string>): string {
  if (!semesterId) return '—';
  return labels.get(semesterId) ?? semesterId;
}

interface PreviewCardProps {
  mode: 'fastest' | 'easiest';
  summary: PlanDifficultySummary | null;
  labels: Map<string, string>;
}

function PreviewCard({ mode, summary, labels }: PreviewCardProps) {
  const isFastest = mode === 'fastest';
  return (
    <Card
      className={cn(
        'flex-1 p-5 text-left',
        isFastest
          ? 'border-blue-500/30 bg-blue-500/[0.03]'
          : 'border-amber-500/30 bg-amber-500/[0.03]'
      )}
      data-testid={`hero-preview-${mode}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md',
            isFastest ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          )}
        >
          {isFastest ? <Gauge className="h-4 w-4" /> : <GraduationCap className="h-4 w-4" />}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {isFastest ? 'Fastest' : 'Easiest (GPA)'}
        </span>
      </div>

      <dl className="space-y-1.5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Graduates</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {gradLabel(summary?.graduationSemesterId ?? null, labels)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Peak difficulty</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {summary ? `${summary.aggregateDifficulty} / 100` : '—'}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">Expected GPA</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {summary?.expectedGpa != null ? summary.expectedGpa.toFixed(2) : '—'}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {isFastest
          ? 'Graduate as soon as the prereq chains allow.'
          : 'Spread the hardest courses to protect your GPA.'}
      </p>
    </Card>
  );
}

export function LandingHero() {
  const navigate = useNavigate();
  const summaries = usePlanOptimizeSummary();
  const semesters = useSemesters();
  const labels = new Map(semesters.map((s) => [s.id, s.id]));

  const go = (cta: string) => {
    track('home_landing_cta', { cta });
    navigate('/plan');
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-6 py-10 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Find the best way to graduate.
      </h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
        A deterministic planner that knows UT ECE&apos;s real prerequisites,
        offerings, and requirements — so it builds a <em>valid</em> plan, not an
        LLM guess.
      </p>

      <div className="mt-8 flex w-full flex-col gap-4 sm:flex-row">
        <PreviewCard mode="fastest" summary={summaries?.fastest ?? null} labels={labels} />
        <PreviewCard mode="easiest" summary={summaries?.easiest ?? null} labels={labels} />
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => go('upload_transcript')} className="gap-2">
          <Upload className="h-4 w-4" />
          Upload transcript
        </Button>
        <Button variant="outline" onClick={() => go('start_fresh')} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Start fresh
        </Button>
        <Button variant="ghost" onClick={() => go('example_plan')} className="gap-2">
          <FileText className="h-4 w-4" />
          Example plan
        </Button>
      </div>
    </div>
  );
}
