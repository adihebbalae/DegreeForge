import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Notice } from '@/components/ui/notice';
import { Lock } from 'lucide-react';
import { useTechCoresRecord } from '@/context/DataContext';
import { useSettings, useSettingsDispatch, type LoadTolerance } from '@/context/SettingsContext';
import { usePlanDispatch, SEMESTERS } from '@/context/PlanContext';
import { useProfileDispatch, EMPTY_PROFILE } from '@/context/ProfileContext';
import { parseTranscript, type ParsedCourse } from '@/lib/agent-tools/parse-transcript';
import { parseIdaAudit } from '@/lib/parse-ida';
import { deriveTimelinePlanFromProfile } from '@/lib/derive-timeline';
import { sanitizePlan, sanitizeCourseList, isValidCourseId } from '@/lib/sanitize-course-list';
import { track } from '@/lib/analytics';
import type { UserProfile } from '@/types';

type ImportSource = 'transcript' | 'ida';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const techCores = useTechCoresRecord();
  const settings = useSettings();
  const settingsDispatch = useSettingsDispatch();
  const planDispatch = usePlanDispatch();
  const profileDispatch = useProfileDispatch();

  const [step, setStep] = useState(1);
  const totalSteps = 7;

  const [accessCodeInput, setAccessCodeInput] = useState(settings.accessCode);

  const [major, setMajor] = useState('ece-bse');
  const [catalogYear, setCatalogYear] = useState('2024');
  const [gradTarget, setGradTarget] = useState('Spring 2028');
  const [loadTolerance, setLoadTolerance] = useState<LoadTolerance>('normal');
  const [techCoreId, setTechCoreId] = useState<string>('skip');
  const [importSource, setImportSource] = useState<ImportSource>('transcript');
  const [transcriptText, setTranscriptText] = useState('');
  const [parsedCourses, setParsedCourses] = useState<ParsedCourse[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [transcriptError, setTranscriptError] = useState(false);

  const handleNext = () => setStep(s => Math.min(s + 1, totalSteps));
  const handleBack = () => setStep(s => Math.max(s - 1, 1));

  const handleParseTranscript = () => {
    if (!transcriptText.trim()) {
      handleNext();
      return;
    }
    setIsParsing(true);
    try {
      const courses = importSource === 'ida'
        ? parseIdaAudit(transcriptText)
        : parseTranscript(transcriptText);
      setIsParsing(false);
      if (courses.length === 0) {
        setTranscriptError(true);
      } else {
        setTranscriptError(false);
        setParsedCourses(courses);
        handleNext();
      }
    } catch (err) {
      console.error('Transcript parse error:', err);
      setIsParsing(false);
      setTranscriptError(true);
    }
  };

  const handleCommit = () => {
    // Settings dispatches (tolerance, grad target, tech core) remain in SettingsContext.
    settingsDispatch({ type: 'SET_GRAD_TARGET', value: gradTarget });
    settingsDispatch({ type: 'SET_LOAD_TOLERANCE', value: loadTolerance });
    if (techCoreId !== 'skip') {
      settingsDispatch({ type: 'SET_TECH_CORE', value: techCoreId });
    }

    // Build the owned profile from EMPTY_PROFILE + wizard choices + parsed courses.
    // Known limitation: the Transcript path (parseTranscript) requires a grade token
    // on each row, so real UT transcript rows for in-progress courses (which have an
    // absent/empty grade field) may be dropped entirely. The IDA path (parseIdaAudit)
    // handles in-progress courses correctly via the "IP" grade token. If in-progress
    // courses are missing after a transcript import, use the IDA path or add them
    // manually via Settings > Profile.
    // Theme B: validate course identity at the transcript / IDA ingress. Drop any
    // extracted token that isn't a valid course code (e.g. a requirement-section
    // header the IDA parser mistook for a course) so it can't become a phantom
    // completed course that satisfies a requirement or pins a non-existent node.
    const { dropped } = sanitizeCourseList(parsedCourses.map(c => c.courseId));
    if (dropped.length > 0) {
      console.warn(`[onboarding] dropped ${dropped.length} unrecognized course token(s):`, dropped);
    }
    const cleanParsed = parsedCourses.filter(c => isValidCourseId(c.courseId));

    const completedCourses: UserProfile['completed_courses'] = cleanParsed
      .filter(c => c.grade !== 'IP')
      .map(c => ({
        course: c.courseId,
        title: c.title,
        grade: c.grade,
        semester: c.semester,
        type: 'Imported',
        credit_hours: c.creditHours,
        // Propagate the source inferred by the parser so AP/transfer credits
        // don't inflate the destination semester's course-load total.
        source: c.source,
      }));

    const inProgressCourses: UserProfile['in_progress_courses'] = cleanParsed
      .filter(c => c.grade === 'IP')
      .map(c => ({
        course: c.courseId,
        title: c.title,
        semester: c.semester,
        credit_hours: c.creditHours,
      }));

    const profile: UserProfile = {
      ...EMPTY_PROFILE,
      major,
      catalog_year: catalogYear,
      graduation_target: gradTarget,
      completed_courses: completedCourses,
      in_progress_courses: inProgressCourses,
    };

    // Write owned profile — all requirement/progress consumers read from ProfileContext.
    profileDispatch({ type: 'SET_PROFILE', profile });

    // Seed timeline from the new profile so past/current semesters reflect imports.
    // Layer A: sanitize derived plan to drop any invalid tokens from transcript parse.
    const rawDerived = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    const { safePlan: derivedPlan } = sanitizePlan(rawDerived as Record<string, unknown[]>);
    planDispatch({ type: 'SET_PLAN', plan: derivedPlan });

    // Keep PlanState.major/catalogYear in sync for any consumers that read those fields.
    planDispatch({ type: 'SET_PROFILE_META', major, catalogYear });

    track('onboarding_completed');

    onComplete();
  };

  const completedCount = parsedCourses.filter(c => c.grade !== 'IP').length;
  const inProgressCount = parsedCourses.filter(c => c.grade === 'IP').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <CardTitle>Welcome to DegreeForge</CardTitle>
            <div className="text-sm text-muted-foreground">Step {step} of {totalSteps}</div>
          </div>
          <CardDescription>Let&apos;s set up your initial degree plan profile.</CardDescription>
          {/* Stepper */}
          <div className="flex gap-2 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full transition-colors ${i + 1 <= step ? 'bg-primary' : 'bg-secondary'}`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="min-h-[300px]">
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Beta access code</h3>
              <p className="text-sm text-muted-foreground">
                Enter the access code you were given to enable the AI assistant.
                No code? You can skip — the planner still works, and you can add a code later in Settings.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="access-code-input">Access code</label>
                <input
                  id="access-code-input"
                  type="password"
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm focus:ring-2 focus:ring-ring outline-none"
                  placeholder="Paste your access code here"
                  value={accessCodeInput}
                  onChange={e => setAccessCodeInput(e.target.value)}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => {
                    settingsDispatch({ type: 'SET_ACCESS_CODE', value: accessCodeInput });
                    handleNext();
                  }}
                >
                  Enter
                </Button>
                <Button variant="outline" onClick={handleNext}>
                  Skip
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Confirm Major & Catalog</h3>
              <div className="space-y-2">
                <label className="text-sm font-medium">Major</label>
                <Select value={major} onValueChange={setMajor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ece-bse">Electrical & Computer Engineering (BSE)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Catalog Year</label>
                <Select value={catalogYear} onValueChange={setCatalogYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['2024', '2025', '2026', '2027', '2028', '2029'].map(y => (
                      <SelectItem key={y} value={y}>{y}-{parseInt(y)+2}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Target Graduation</h3>
              <div className="space-y-2">
                <label className="text-sm font-medium">Expected Graduation Semester</label>
                <Select value={gradTarget} onValueChange={setGradTarget}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['Spring 2027', 'Fall 2027', 'Spring 2028', 'Fall 2028', 'Spring 2029', 'Fall 2029', 'Spring 2030', 'Spring 2031'].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Load Tolerance</h3>
              <p className="text-sm text-muted-foreground">How many credit hours do you prefer to take per semester?</p>
              <div className="space-y-3 mt-4">
                {[
                  { id: 'light', label: 'Light', desc: 'up to 15 hrs/semester' },
                  { id: 'normal', label: 'Normal', desc: 'up to 17 hrs/semester' },
                  { id: 'above_average', label: 'Above Average', desc: 'up to 18 hrs/semester' },
                  { id: 'heavy', label: 'Heavy', desc: 'up to 19 hrs/semester' },
                ].map(opt => (
                  <div
                    key={opt.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${loadTolerance === opt.id ? 'border-primary bg-primary/10' : 'hover:bg-secondary'}`}
                    onClick={() => setLoadTolerance(opt.id as LoadTolerance)}
                  >
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-sm text-muted-foreground">{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Tech Core Preference</h3>
              <p className="text-sm text-muted-foreground">Select a primary tech core track, or skip to let the recommender help you later.</p>
              <div className="space-y-2 mt-4">
                <Select value={techCoreId} onValueChange={setTechCoreId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip — let recommender decide later</SelectItem>
                    {Object.entries(techCores ?? {}).map(([id, core]) => (
                      <SelectItem key={id} value={id}>{core.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4 flex flex-col h-full animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Import Course History (Optional)</h3>
              <p className="text-sm text-muted-foreground">
                Paste your UT transcript text <em>or</em> your Interactive Degree Audit to automatically mark courses as completed or in-progress.
              </p>
              {/* Source toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${importSource === 'transcript' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
                  onClick={() => { setImportSource('transcript'); setTranscriptError(false); }}
                >
                  Transcript
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${importSource === 'ida' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
                  onClick={() => { setImportSource('ida'); setTranscriptError(false); }}
                >
                  IDA Audit
                </button>
              </div>
              <textarea
                className="flex-1 w-full min-h-[150px] p-3 rounded-md border bg-background text-sm resize-none focus:ring-2 focus:ring-ring outline-none"
                placeholder={importSource === 'ida'
                  ? 'ECE 302  Intro to Electrical Eng  A  FA 2025  3.0\n...'
                  : 'ECE 302 Intro to Electrical Eng A Fall 2025 3\n...'}
                value={transcriptText}
                onChange={e => { setTranscriptText(e.target.value); setTranscriptError(false); }}
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                Parsed on your device — your grades are never sent to our servers.
              </p>
              {transcriptError && (
                <Notice
                  variant="error"
                  message={importSource === 'ida'
                    ? 'Could not parse the IDA audit. Try switching to Transcript mode, or skip and add courses manually.'
                    : 'Could not parse the transcript. Most common cause: PDF copy-paste lost line breaks.'}
                  action={{ label: 'Clear text', onClick: () => { setTranscriptText(''); setTranscriptError(false); } }}
                  onDismiss={() => setTranscriptError(false)}
                />
              )}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Review & Commit</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Major</span>
                  <span className="font-medium">ECE BSE ({catalogYear})</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Graduation Target</span>
                  <span className="font-medium">{gradTarget}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Load Tolerance</span>
                  <span className="font-medium capitalize">{loadTolerance.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Tech Core</span>
                  <span className="font-medium">{techCoreId === 'skip' ? 'Decide Later' : techCores?.[techCoreId]?.name}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Completed courses</span>
                  <Badge variant="secondary">{completedCount} found</Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">In-progress courses</span>
                  <Badge variant="secondary">{inProgressCount} found</Badge>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between border-t p-4">
          {/* On step 1 (access code), Back is hidden — the wizard hasn't started yet */}
          <Button variant="ghost" onClick={handleBack} disabled={step === 1}>
            Back
          </Button>
          <div className="flex gap-2">
            {/* Step 1 uses its own inline Enter/Skip buttons; hide the global ones */}
            {step > 1 && step < totalSteps && (
               <Button variant="outline" onClick={handleNext}>Skip</Button>
            )}
            {step === 1 ? null : step < totalSteps - 1 ? (
              <Button onClick={handleNext}>Next</Button>
            ) : step === 6 ? (
              <Button onClick={handleParseTranscript} disabled={isParsing}>
                {isParsing ? 'Parsing...' : 'Next'}
              </Button>
            ) : (
              <Button onClick={handleCommit}>Start Planning</Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
