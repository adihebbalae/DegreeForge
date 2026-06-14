import { useMemo, useEffect } from 'react';
import { X, Zap, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  usePlanDispatch,
  usePlan,
  useWhatIf,
  usePlanContext,
  useGradeEntries,
} from '@/context/PlanContext';
import { useSettings } from '@/context/SettingsContext';
import {
  useTechCores,
  useTechCoresRecord,
  useMathRequirements,
  useCatalogRecord,
  useUserProfile,
} from '@/context/DataContext';
import { computeWhatIfDiff } from '@/lib/what-if';
import { runSolver } from '@/lib/run-solver';
import { getCreditHourCap } from '@/lib/auto-planner';
import { sanitizePlan } from '@/lib/sanitize-course-list';
import { postAiJson } from '@/lib/ai-api';
import { TechCoreTrack } from '@/types';
import { useDegreeRequirements, useOfferingSchedule } from '@/context/DataContext';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import { usePrereqGraph as useEngineGraph } from '@/hooks/usePrereqGraph';
import { Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { QuestionnaireDialog } from './QuestionnaireDialog';

interface WhatIfPanelProps {
  onClose: () => void;
}

export default function WhatIfPanel({ onClose }: WhatIfPanelProps) {
  const { state, dispatch } = usePlanContext();
  const plan = state.plan;
  const whatIf = state.whatIf;
  const settings = useSettings();
  // Baseline values come from SettingsContext (single source of truth).
  const currentTechCoreId = settings.techCoreId;
  const currentMathBA = settings.mathBAToggle;

  // On open: seed whatIf staged values from the current Settings baseline so
  // the dropdowns always start from the persisted Settings values.
  // This runs once on mount (panel open), preserving isActive for ProgressBars.
  useEffect(() => {
    dispatch({ type: 'SEED_WHAT_IF', techCoreId: settings.techCoreId, mathBAToggle: settings.mathBAToggle });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — seed only on panel open

  // Staged values come directly from whatIf state (SET_TECH_CORE / TOGGLE_MATH_BA
  // write there on every dropdown change).  No isActive gate here — the gate was
  // causing the dropdown to snap back when isActive=false.
  const stagedTechCoreId = whatIf.techCoreId;
  const stagedMathBA = whatIf.mathBAToggle;
  const [isSolving, setIsSolving] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendationData, setRecommendationData] = useState<{ techCoreId: string; mathBA: boolean; reasoning: string } | null>(null);
  const [customInput, setCustomInput] = useState('');
  const [solverError, setSolverError] = useState<string | null>(null);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [unplacedNotice, setUnplacedNotice] = useState<string | null>(null);
  const gradeEntries = useGradeEntries();

  const techCores = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const catalog = useCatalogRecord();
  const profile = useUserProfile();
  const effectiveProfile = useEffectiveProfile();
  const degreeReqs = useDegreeRequirements();
  const offeringSchedule = useOfferingSchedule();
  const engineGraph = useEngineGraph();

  const techCoreList = (Object.entries(techCores || {}) as [string, TechCoreTrack][]).map(([id, track]) => ({
    id,
    name: track.name,
  }));

  const completedCourses = useMemo(() => [
    ...(profile?.completed_courses?.map(c => c.course) || []),
    ...(profile?.in_progress_courses?.map(c => c.course) || []),
  ], [profile]);

  const diff = useMemo(() => {
    if (!techCores || !mathReqs || !catalog) return null;

    return computeWhatIfDiff(
      { techCoreId: currentTechCoreId, mathBAToggle: currentMathBA },
      { techCoreId: stagedTechCoreId, mathBAToggle: stagedMathBA },
      techCores,
      mathReqs,
      catalog,
      completedCourses
    );
  }, [
    currentTechCoreId,
    currentMathBA,
    stagedTechCoreId,
    stagedMathBA,
    techCores,
    mathReqs,
    catalog,
    completedCourses
  ]);

  const handleApply = (
    effectiveTechCoreId: string = stagedTechCoreId,
    effectiveMathBA: boolean = stagedMathBA,
  ) => {
    if (!techCores || !mathReqs || !profile || !degreeReqs) return;

    setIsSolving(true);
    setUnplacedNotice(null);

    setTimeout(() => {
      try {
        // D4: shared solver helper replaces duplicated setup
        const newPlanOutput = runSolver({
          techCoreId: effectiveTechCoreId,
          mathBAToggle: effectiveMathBA,
          degreeReqs,
          techCores,
          mathReqs,
          profile,
          prereqGraph: engineGraph,
          catalog: catalog ?? {},
          offeringSchedule: offeringSchedule,
          pinnedCourseIds: state.pinnedCourses,
          plan: state.plan,
          semesters: state.semesters,
          maxHoursOverride: effectiveProfile ? getCreditHourCap(effectiveProfile) : undefined,
        });

        // Layer A: route through shared sanitizer so dropped tokens are surfaced here
        // and never enter plan state silently. The reducer also has a layer-B guard but
        // this layer provides the visible "could not be placed" feedback.
        const { safePlan, dropped: droppedTokens } = sanitizePlan(newPlanOutput.plan as Record<string, unknown[]>);

        const allUnplaced = [
          ...newPlanOutput.unplacedCourses,
          ...droppedTokens.filter((t) => t !== null && t !== undefined),
        ];
        const hasUnplaced = allUnplaced.length > 0;
        if (hasUnplaced) {
          const count = allUnplaced.length;
          setUnplacedNotice(
            `${count} course${count === 1 ? '' : 's'} could not be placed: ${allUnplaced.join(', ')}`
          );
        }

        dispatch({ type: 'APPLY_WHAT_IF', newPlan: safePlan });
        if (!hasUnplaced) {
          onClose();
        }
      } catch (error) {
        console.error('What-If solver failed:', error);
        setSolverError((error as Error).message);
      } finally {
        setIsSolving(false);
      }
    }, 50);
  };

  const handleAIRecommend = async (overrideInput?: string, autoAccept = false) => {
    if (!techCores || !profile) return;
    setIsRecommending(true);
    const finalInput = typeof overrideInput === 'string' ? overrideInput : customInput;
    
    try {
      const data = await postAiJson<{ techCoreId: string; mathBA: boolean; reasoning: string }>(
        '/api/recommend',
        { profile, gradeEntries, techCores, customInput: finalInput },
        settings.accessCode
      );

      if (autoAccept) {
        // Questionnaire flow: skip the confirmation dialog and apply immediately.
        // Dispatch to keep the dropdowns in sync, then call handleApply with the
        // recommended values directly — avoids the stale-closure bug where a
        // delayed handleApply() would read the pre-recommendation staged values.
        dispatch({ type: 'SET_TECH_CORE', techCoreId: data.techCoreId });
        dispatch({ type: 'TOGGLE_MATH_BA', enabled: data.mathBA });
        setIsRecommending(false);
        handleApply(data.techCoreId, data.mathBA);
        return;
      }

      setRecommendationData(data);
    } catch (err: any) {
      console.error('AI Recommend failed:', err);
      setRecommendError(err.message ?? 'Recommendation request failed.');
    } finally {
      setIsRecommending(false);
    }
  };

  const acceptRecommendation = () => {
    if (!recommendationData) return;

    // Dispatch to keep the dropdowns in sync, then call handleApply with the
    // recommended values directly — avoids the stale-closure bug where a
    // delayed handleApply() would read the pre-recommendation staged values.
    dispatch({ type: 'SET_TECH_CORE', techCoreId: recommendationData.techCoreId });
    dispatch({ type: 'TOGGLE_MATH_BA', enabled: recommendationData.mathBA });
    handleApply(recommendationData.techCoreId, recommendationData.mathBA);
    setRecommendationData(null);
  };

  const handleCancel = () => {
    dispatch({ type: 'RESET_WHAT_IF' });
    onClose();
  };

  if (!techCores || !mathReqs) return null;

  return (
    <div className="flex flex-col h-full bg-background border-l border-border shadow-lg w-80">
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500 fill-yellow-500" />
          <span className="font-bold">What-If Simulator</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div className="space-y-3 p-4 bg-purple-500/10 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-900/50">
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-2 text-purple-700 dark:text-purple-400">
                <Sparkles className="h-4 w-4" />
                AI Smart Auto-Plan
              </Label>
              <p className="text-xs text-muted-foreground">
                Let the AI analyze your transcript and instantly generate your optimal remaining semesters.
              </p>
            </div>
            <Textarea 
              placeholder="Any custom preferences? (e.g. 'I want to focus heavily on robotics')"
              className="min-h-[80px] text-sm resize-none bg-background"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
            />
            <Button
              className="w-full gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-md border-0"
              onClick={() => { setRecommendError(null); handleAIRecommend(); }}
              disabled={isRecommending || isSolving}
            >
              {isRecommending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isRecommending ? 'Analyzing Profile...' : 'Generate Plan'}
            </Button>
            {recommendError && (
              <Notice
                variant="error"
                message={`Recommendation request failed: ${recommendError}`}
                action={{ label: 'Retry', onClick: () => { setRecommendError(null); handleAIRecommend(); } }}
                onDismiss={() => setRecommendError(null)}
              />
            )}
            <QuestionnaireDialog
              onComplete={(answers) => {
                setCustomInput(answers);
                handleAIRecommend(answers, true);
              }}
            />
          </div>

          {/* ── Configuration ────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tech-core">Tech Core Track</Label>
              <Select
                value={stagedTechCoreId}
                onValueChange={(val) => dispatch({ type: 'SET_TECH_CORE', techCoreId: val })}
              >
                <SelectTrigger id="tech-core">
                  <SelectValue placeholder="Select track" />
                </SelectTrigger>
                <SelectContent>
                  {techCoreList.map((track) => (
                    <SelectItem key={track.id} value={track.id}>
                      {track.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label htmlFor="math-ba">Math BA Double Major</Label>
                <p className="text-xs text-muted-foreground">Consider Math BA requirements</p>
              </div>
              <Switch
                id="math-ba"
                checked={stagedMathBA}
                onCheckedChange={(checked) => dispatch({ type: 'TOGGLE_MATH_BA', enabled: checked })}
              />
            </div>
          </div>

          <Separator />

          {/* ── Impact Preview ───────────────────────────────────────────── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Impact Preview
            </h3>

            {diff && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <Card className="bg-muted/20 border-none shadow-none">
                    <CardContent className="p-3 pt-3 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-green-600">
                        {diff.creditHourDelta > 0 ? `+${diff.creditHourDelta}` : diff.creditHourDelta}
                      </span>
                      <span className="text-[10px] uppercase text-muted-foreground font-medium">
                        Credit Hours
                      </span>
                    </CardContent>
                  </Card>
                  <Card className="bg-muted/20 border-none shadow-none">
                    <CardContent className="p-3 pt-3 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-primary">
                        {diff.semesterDelta > 0 ? `+${diff.semesterDelta}` : diff.semesterDelta}
                      </span>
                      <span className="text-[10px] uppercase text-muted-foreground font-medium">
                        Semesters
                      </span>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-3">
                  {diff.coursesAdded.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-green-700 dark:text-green-400">
                        Courses Added ({diff.coursesAdded.length})
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {diff.coursesAdded.map(id => (
                          <Badge key={id} variant="secondary" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300">
                            {id}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {diff.coursesRemoved.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-red-700 dark:text-red-400">
                        Courses Removed ({diff.coursesRemoved.length})
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {diff.coursesRemoved.map(id => (
                          <Badge key={id} variant="secondary" className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300">
                            {id}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {diff.coursesAdded.length === 0 && diff.coursesRemoved.length === 0 && (
                    <p className="text-xs text-center text-muted-foreground py-4 italic">
                      No course changes identified
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border bg-muted/20 space-y-2">
        {solverError && (
          <Notice
            variant="error"
            message={`Could not recalculate plan: ${solverError}`}
            action={{ label: 'Retry', onClick: () => { setSolverError(null); handleApply(); } }}
            onDismiss={() => setSolverError(null)}
          />
        )}
        {unplacedNotice && (
          <Notice
            variant="info"
            message={unplacedNotice}
            action={{ label: 'Dismiss', onClick: () => { setUnplacedNotice(null); onClose(); } }}
            onDismiss={() => { setUnplacedNotice(null); onClose(); }}
          />
        )}
        <Button
          className="w-full gap-2"
          onClick={() => { setSolverError(null); handleApply(); }}
          disabled={isSolving}
        >
          {isSolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {isSolving ? 'Calculating...' : 'Apply to Plan'}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleCancel}
        >
          Cancel Simulation
        </Button>
      </div>

      <Dialog open={!!recommendationData} onOpenChange={(open) => !open && setRecommendationData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Recommendation
            </DialogTitle>
            <DialogDescription>
              Based on your transcript and preferences, here is your customized track.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Recommended Track</Label>
              <div className="font-semibold text-lg">
                {recommendationData && techCoreList.find(t => t.id === recommendationData.techCoreId)?.name}
                {recommendationData?.mathBA && ' + Math BA'}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Why this track?</Label>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {recommendationData?.reasoning}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecommendationData(null)}>Cancel</Button>
            <Button onClick={acceptRecommendation} disabled={isSolving}>
              {isSolving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Accept & Generate Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
