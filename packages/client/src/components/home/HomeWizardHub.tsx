/**
 * HomeWizardHub — TASK-077 (Direction 4: Guided Wizard Hub)
 *
 * The home screen ("/") for the `wizard-hub` A/B variant. A compact 4-step
 * stepper that makes the key planning decisions, seeds a plan tailored to the
 * goal, then drops the student into the planner. It is the lighter, `/`-resident
 * relative of OnboardingWizard: same data targets (SettingsContext grad target /
 * load tolerance / tech core, an owned UserProfile, and the Recommend auto-plan
 * path), fewer steps, no transcript import.
 *
 * Reuse, not reimplementation:
 *  - Persists choices through the SAME context dispatches OnboardingWizard uses
 *    (settingsDispatch SET_GRAD_TARGET / SET_LOAD_TOLERANCE / SET_TECH_CORE,
 *    profileDispatch SET_PROFILE built from EMPTY_PROFILE).
 *  - Seeds the plan via useRecommendPlan() — the existing deterministic
 *    auto-planner / Recommend flow — never a bespoke solver call.
 *
 * Takes no props: it reads context and is mounted by HomeRoute's variant map.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Calendar, Gauge, Layers, Rocket, ArrowLeft, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WizardStepper } from './WizardStepper';
import { WizardOptionCard } from './WizardOptionCard';
import { STANDING_OPTIONS, GRAD_TARGET_OPTIONS, GOAL_MODE_OPTIONS } from './wizard-options';
import { useTechCoresRecord, useUserProfile } from '@/context/DataContext';
import { useSettingsDispatch } from '@/context/SettingsContext';
import { useProfileDispatch, EMPTY_PROFILE } from '@/context/ProfileContext';
import { useUi } from '@/context/UiContext';
import { useRecommendPlan } from '@/hooks/useRecommendPlan';
import { track } from '@/lib/analytics';
import type { UserProfile } from '@/types';

const STEP_LABELS = ['Standing', 'Goal', 'Track', 'Review'];
const TOTAL_STEPS = STEP_LABELS.length;

export default function HomeWizardHub() {
  const navigate = useNavigate();
  const techCores = useTechCoresRecord();
  const ownedProfile = useUserProfile();
  const settingsDispatch = useSettingsDispatch();
  const profileDispatch = useProfileDispatch();
  const { setOptimizeMode } = useUi();
  const { handleRecommendPlan } = useRecommendPlan();

  const [step, setStep] = useState(1);

  // Step choices. Defaults are deliberately "safe middle" so a student who skims
  // and clicks Next still gets a sensible seed.
  const [standingId, setStandingId] = useState(STANDING_OPTIONS[1].id); // Sophomore
  const [gradTarget, setGradTarget] = useState('Spring 2028');
  const [goalMode, setGoalMode] = useState<'fastest' | 'easiest'>('fastest');
  const [techCoreId, setTechCoreId] = useState<string>('skip');

  // Two-phase finish: dispatch profile/settings, then run Recommend once the
  // effective profile reflects the chosen goal. Running Recommend inline would
  // read the stale (pre-dispatch) profile from useRecommendPlan's closure.
  const [pendingSeed, setPendingSeed] = useState(false);

  const standing = STANDING_OPTIONS.find(s => s.id === standingId) ?? STANDING_OPTIONS[1];

  const goNext = () => setStep(s => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => setStep(s => Math.max(s - 1, 1));

  const skipToPlanner = () => {
    track('wizard_hub_skipped', { step });
    navigate('/plan');
  };

  const commitChoices = () => {
    // Settings — mirror OnboardingWizard's SettingsContext writes.
    settingsDispatch({ type: 'SET_GRAD_TARGET', value: gradTarget });
    settingsDispatch({ type: 'SET_LOAD_TOLERANCE', value: standing.loadTolerance });
    if (techCoreId !== 'skip') {
      settingsDispatch({ type: 'SET_TECH_CORE', value: techCoreId });
    }

    // Owned profile — same EMPTY_PROFILE + choices shape as onboarding (minus the
    // transcript import this lighter hub omits).
    const profile: UserProfile = {
      ...EMPTY_PROFILE,
      classification: standing.classification,
      graduation_target: gradTarget,
      tech_core: {
        ...EMPTY_PROFILE.tech_core,
        declared: techCoreId !== 'skip' ? techCoreId : EMPTY_PROFILE.tech_core.declared,
      },
    };
    profileDispatch({ type: 'SET_PROFILE', profile });

    // The objective the seed plan is built for. Drives useRecommendPlan's mode.
    setOptimizeMode(goalMode);
  };

  const handleLaunch = () => {
    track('wizard_hub_completed', { mode: goalMode, standing: standingId });
    commitChoices();
    setPendingSeed(true);
  };

  // Once the dispatched profile has settled (graduation_target now reflects the
  // chosen goal), seed the plan through the existing Recommend path and route to
  // the planner. Guarded so it fires exactly once per launch.
  useEffect(() => {
    if (!pendingSeed) return;
    if (ownedProfile?.graduation_target !== gradTarget) return; // wait for state to settle
    setPendingSeed(false);
    handleRecommendPlan();
    navigate('/plan');
  }, [pendingSeed, ownedProfile, gradTarget, handleRecommendPlan, navigate]);

  return (
    <div className="flex min-h-[calc(100vh-3rem)] items-start justify-center px-4 py-8 sm:items-center">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <GraduationCap className="h-6 w-6 text-blue-500" aria-hidden="true" />
              Let&apos;s build your plan
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={skipToPlanner}>
              Skip to planner
            </Button>
          </div>
          <WizardStepper steps={STEP_LABELS} current={step} />
        </CardHeader>

        <CardContent className="min-h-[280px]">
          {step === 1 && (
            <section className="space-y-4 animate-in fade-in slide-in-from-right-4" aria-labelledby="wizard-step-standing">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-500" aria-hidden="true" />
                <h2 id="wizard-step-standing" className="text-lg font-medium">Where are you in your degree?</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                This sets a starting semester load. You can change it anytime in Settings.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {STANDING_OPTIONS.map(opt => (
                  <WizardOptionCard
                    key={opt.id}
                    name="wizard-standing"
                    value={opt.id}
                    selected={standingId === opt.id}
                    label={opt.label}
                    hint={opt.hint}
                    onSelect={setStandingId}
                  />
                ))}
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4 animate-in fade-in slide-in-from-right-4" aria-labelledby="wizard-step-goal">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-500" aria-hidden="true" />
                <h2 id="wizard-step-goal" className="text-lg font-medium">When do you want to graduate?</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                This affects how hard each semester is. You can change it anytime.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {GRAD_TARGET_OPTIONS.map(target => (
                  <WizardOptionCard
                    key={target}
                    name="wizard-grad-target"
                    value={target}
                    selected={gradTarget === target}
                    label={target}
                    onSelect={setGradTarget}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Gauge className="h-5 w-5 text-blue-500" aria-hidden="true" />
                <h3 className="font-medium">How should we get you there?</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {GOAL_MODE_OPTIONS.map(opt => (
                  <WizardOptionCard
                    key={opt.id}
                    name="wizard-goal-mode"
                    value={opt.id}
                    selected={goalMode === opt.id}
                    label={opt.label}
                    hint={opt.hint}
                    onSelect={v => setGoalMode(v as 'fastest' | 'easiest')}
                  />
                ))}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-4 animate-in fade-in slide-in-from-right-4" aria-labelledby="wizard-step-track">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-blue-500" aria-hidden="true" />
                <h2 id="wizard-step-track" className="text-lg font-medium">Pick a tech core track</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Not sure yet? Skip it — the recommender can choose one for you, and you can change it anytime.
              </p>
              <Select value={techCoreId} onValueChange={setTechCoreId}>
                <SelectTrigger className="h-12 text-base" aria-label="Tech core track">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Skip — let the recommender decide</SelectItem>
                  {Object.entries(techCores ?? {}).map(([id, core]) => (
                    <SelectItem key={id} value={id}>{core.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          )}

          {step === 4 && (
            <section className="space-y-4 animate-in fade-in slide-in-from-right-4" aria-labelledby="wizard-step-review">
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-blue-500" aria-hidden="true" />
                <h2 id="wizard-step-review" className="text-lg font-medium">Ready to launch</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                We&apos;ll seed a plan from these choices. Nothing here is permanent — change any of it later in Settings.
              </p>
              <dl className="space-y-3">
                <div className="flex items-center justify-between border-b py-2">
                  <dt className="text-muted-foreground">Standing</dt>
                  <dd className="font-medium">{standing.label}</dd>
                </div>
                <div className="flex items-center justify-between border-b py-2">
                  <dt className="text-muted-foreground">Graduation target</dt>
                  <dd className="font-medium">{gradTarget}</dd>
                </div>
                <div className="flex items-center justify-between border-b py-2">
                  <dt className="text-muted-foreground">Plan style</dt>
                  <dd className="font-medium">{GOAL_MODE_OPTIONS.find(o => o.id === goalMode)?.label}</dd>
                </div>
                <div className="flex items-center justify-between border-b py-2">
                  <dt className="text-muted-foreground">Tech core</dt>
                  <dd className="font-medium">{techCoreId === 'skip' ? 'Decide later' : techCores?.[techCoreId]?.name}</dd>
                </div>
              </dl>
            </section>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-2 border-t p-4">
          <Button variant="ghost" onClick={goBack} disabled={step === 1}>
            <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={skipToPlanner}>
              Skip to planner
            </Button>
            {step < TOTAL_STEPS ? (
              <Button onClick={goNext}>
                Next
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button onClick={handleLaunch} disabled={pendingSeed}>
                <Rocket className="mr-1 h-4 w-4" aria-hidden="true" />
                Launch planner
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
