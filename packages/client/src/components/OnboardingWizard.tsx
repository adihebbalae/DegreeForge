import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Notice } from '@/components/ui/notice';
import { Lock, Upload, X } from 'lucide-react';
import { useTechCoresRecord } from '@/context/DataContext';
import { useSettingsDispatch, type LoadTolerance } from '@/context/SettingsContext';
import { usePlanDispatch, SEMESTERS } from '@/context/PlanContext';
import { useProfileDispatch, EMPTY_PROFILE } from '@/context/ProfileContext';
import { parseTranscript, type ParsedCourse } from '@/lib/agent-tools/parse-transcript';
import { parseIdaAudit } from '@/lib/parse-ida';
import { extractPdfText } from '@/lib/extract-pdf-text';
import { deriveTimelinePlanFromProfile } from '@/lib/derive-timeline';
import { sanitizePlan, sanitizeCourseList, isValidCourseId } from '@/lib/sanitize-course-list';
import { safeSetItem } from '@/lib/persist';
import { PROFILE_SOURCE_KEY } from '@/components/DemoSeedBootstrap';
import { track } from '@/lib/analytics';
import type { UserProfile } from '@/types';

type ImportSource = 'transcript' | 'ida';

interface OnboardingWizardProps {
  /**
   * Called on the skip-import path (user skips step 4) and the review-step
   * "Start Planning" path (step 5). Neither path shows the upload reward.
   * Do NOT add reward navigation here — that is onImportComplete's job.
   */
  onComplete: () => void;
  /** Optional: called when the user dismisses the wizard without completing it. */
  onDismiss?: () => void;
  /**
   * TASK-105 Phase 2: called instead of onComplete when the import step produces
   * a successful parse (≥1 course). Receives the cleaned counts so the caller can
   * navigate to the /progress reveal. When not provided, falls back to onComplete.
   * This is the ONLY path that triggers the upload reward — onComplete never does.
   */
  onImportComplete?: (completed: number, inProgress: number, source: ImportSource) => void;
}

export function OnboardingWizard({ onComplete, onDismiss, onImportComplete }: OnboardingWizardProps) {
  const techCores = useTechCoresRecord();
  const settingsDispatch = useSettingsDispatch();
  const planDispatch = usePlanDispatch();
  const profileDispatch = useProfileDispatch();

  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // TASK-105: steps are now grad_target, load_tolerance, tech_core, import, review
  // (access_code and major_catalog steps removed from the first-run flow)
  const [catalogYear, setCatalogYear] = useState('2024');
  const [gradTarget, setGradTarget] = useState('Spring 2028');
  const [loadTolerance, setLoadTolerance] = useState<LoadTolerance>('normal');
  const [techCoreId, setTechCoreId] = useState<string>('skip');
  const [importSource, setImportSource] = useState<ImportSource>('transcript');
  const [transcriptText, setTranscriptText] = useState('');
  const [parsedCourses, setParsedCourses] = useState<ParsedCourse[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [transcriptError, setTranscriptError] = useState(false);
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guard against double-commit within one wizard lifecycle (e.g. future refactor
  // accidentally wires both the import-success path and the review-step path).
  const committedRef = useRef(false);

  // TASK-106: readable names for each wizard step (used in funnel events only)
  const STEP_NAMES: Record<number, string> = {
    1: 'grad_target',
    2: 'load_tolerance',
    3: 'tech_core',
    4: 'import',
    5: 'review',
  };

  // TASK-106: fire once on mount to mark funnel entry
  useEffect(() => {
    track('onboarding_started');
  }, []);

  // TASK-106: fire on every step change so we can see exactly where users bail
  // PRIVACY: only step number + name are sent — no profile/course/grade data
  useEffect(() => {
    track('onboarding_step_viewed', { step, name: STEP_NAMES[step] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleNext = () => setStep(s => Math.min(s + 1, totalSteps));
  const handleBack = () => setStep(s => Math.max(s - 1, 1));

  const MAX_PDF_BYTES = 10 * 1024 * 1024;

  const handlePdfFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setPdfError('Please select a PDF file.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setPdfError('This PDF is too large (max 10 MB). Try pasting the text instead.');
      return;
    }
    setPdfError(null);
    setTranscriptError(false);
    setIsExtractingPdf(true);
    try {
      const text = await extractPdfText(file);
      setTranscriptText(text);
    } catch (err: unknown) {
      setPdfError(err instanceof Error ? err.message : 'Could not read this PDF. Try pasting the text instead.');
    } finally {
      setIsExtractingPdf(false);
    }
  }, []);

  const handleParseTranscript = () => {
    if (!transcriptText.trim()) {
      handleNext();
      return;
    }
    // TASK-106: user has pasted something and clicked Next — record the attempt
    // PRIVACY: only source string ('ida'|'transcript') is sent — no text, no course IDs
    track('onboarding_import_attempted', { source: importSource });
    setIsParsing(true);
    try {
      const courses = importSource === 'ida'
        ? parseIdaAudit(transcriptText)
        : parseTranscript(transcriptText);
      setIsParsing(false);
      if (courses.length === 0) {
        // TASK-106: parser ran but found nothing — counts as failed
        // Graceful (no false reward): do NOT navigate to /progress on 0 courses.
        track('onboarding_import_failed', { source: importSource });
        setTranscriptError(true);
      } else {
        // TASK-106: successful parse — record count only (no course IDs or grades)
        track('onboarding_import_parsed', { source: importSource, count: courses.length });
        setTranscriptError(false);
        setParsedCourses(courses);

        // TASK-105 Phase 2: if a reward-navigation callback is wired, commit
        // immediately and short-circuit the remaining review step. The user
        // goes straight to the /progress reveal with their parsed counts.
        if (onImportComplete) {
          const result = commitWizardState(courses);
          if (result) {
            track('onboarding_completed');
            onImportComplete(result.completed, result.inProgress, importSource);
          }
        } else {
          // Original path: advance to review step so user can confirm + "Start Planning".
          handleNext();
        }
      }
    } catch (err) {
      console.error('Transcript parse error:', err);
      // TASK-106: parser threw — also a failure
      // Graceful (no false reward): do NOT navigate to /progress on parse error.
      track('onboarding_import_failed', { source: importSource });
      setIsParsing(false);
      setTranscriptError(true);
    }
  };

  /**
   * Shared commit: writes settings + profile + plan from wizard state.
   * Used by both the review-step "Start Planning" path and the import-success
   * short-circuit path (TASK-105 Phase 2).
   *
   * Returns the cleaned completed/in-progress counts so the caller can pass
   * them to the reveal navigation. Returns null on a double-call (idempotency
   * guard — no-op so a future refactor can't double-commit + re-seed the plan).
   */
  const commitWizardState = (courses: ParsedCourse[]): { completed: number; inProgress: number } | null => {
    if (committedRef.current) return null;
    committedRef.current = true;

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
    const { dropped } = sanitizeCourseList(courses.map(c => c.courseId));
    if (dropped.length > 0) {
      console.warn(`[onboarding] dropped ${dropped.length} unrecognized course token(s):`, dropped);
    }
    const cleanParsed = courses.filter(c => isValidCourseId(c.courseId));

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

    // ECE BSE is the only major; catalog_year is set on the review step.
    const major = 'ece-bse';

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

    // Mark the profile as user-imported so the "Exploring the example?" CTA hides.
    safeSetItem(PROFILE_SOURCE_KEY, 'user');

    return {
      completed: completedCourses.length,
      inProgress: inProgressCourses.length,
    };
  };

  const handleCommit = () => {
    const result = commitWizardState(parsedCourses);
    if (result) {
      track('onboarding_completed');
      onComplete();
    }
  };

  // Post-sanitize counts: filter through isValidCourseId so the review-step
  // badges reflect the same set that commitWizardState will actually commit.
  // Pre-sanitize counts (raw parsedCourses) could be inflated if the parser
  // returned unrecognized tokens that sanitizeCourseList would drop.
  const cleanParsedForReview = useMemo(
    () => parsedCourses.filter(c => isValidCourseId(c.courseId)),
    [parsedCourses]
  );
  const completedCount = cleanParsedForReview.filter(c => c.grade !== 'IP').length;
  const inProgressCount = cleanParsedForReview.filter(c => c.grade === 'IP').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <CardTitle>Personalize your plan</CardTitle>
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground">Step {step} of {totalSteps}</div>
              {onDismiss && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDismiss}
                  aria-label="Close setup"
                  className="h-7 w-7 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <CardDescription>Set your graduation goal and import your course history (optional).</CardDescription>
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

          {step === 2 && (
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

          {step === 3 && (
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

          {step === 4 && (
            <div className="space-y-4 flex flex-col h-full animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Import Course History (Optional)</h3>
              <p className="text-sm text-muted-foreground">
                Upload or paste your UT transcript <em>or</em> Interactive Degree Audit to automatically mark courses as completed or in-progress.
              </p>
              {/* Source toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${importSource === 'transcript' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
                  onClick={() => { setImportSource('transcript'); setTranscriptError(false); setPdfError(null); }}
                >
                  Transcript
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-colors ${importSource === 'ida' ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
                  onClick={() => { setImportSource('ida'); setTranscriptError(false); setPdfError(null); }}
                >
                  IDA Audit
                </button>
              </div>
              {importSource === 'transcript' && (
                <p className="text-xs text-muted-foreground">
                  Find your unofficial transcript{' '}
                  <a
                    href="https://utdirect.utexas.edu/apps/student/academic_summary/summary/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground transition-colors"
                  >
                    here
                  </a>
                  .
                </p>
              )}
              {/* PDF drop zone — additive above the textarea */}
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload PDF — drag and drop or click to select"
                className={`flex items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-3 text-sm transition-colors cursor-pointer select-none
                  ${isDragOver ? 'border-primary bg-primary/10 text-primary' : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/60 hover:text-foreground'}
                  ${isExtractingPdf ? 'opacity-60 pointer-events-none' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void handlePdfFile(f);
                }}
              >
                <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                {isExtractingPdf
                  ? 'Reading PDF…'
                  : transcriptText
                    ? 'Replace with another PDF'
                    : 'Drop PDF here or click to upload'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="sr-only"
                  aria-hidden="true"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) void handlePdfFile(f);
                    // reset so same file can be re-selected
                    e.target.value = '';
                  }}
                />
              </div>
              {pdfError && (
                <Notice
                  variant="error"
                  message={pdfError}
                  onDismiss={() => setPdfError(null)}
                />
              )}
              <textarea
                className="flex-1 w-full min-h-[120px] p-3 rounded-md border bg-background text-sm resize-none focus:ring-2 focus:ring-ring outline-none"
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

          {step === 5 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Review & Commit</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Major</span>
                  <span className="font-medium">ECE BSE</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Catalog Year</span>
                  <div className="w-36">
                    <Select value={catalogYear} onValueChange={setCatalogYear}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['2024', '2025', '2026', '2027', '2028', '2029'].map(y => (
                          <SelectItem key={y} value={y}>{y}–{parseInt(y)+2}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
          <Button variant="ghost" onClick={handleBack} disabled={step === 1}>
            Back
          </Button>
          <div className="flex gap-2">
            {step < totalSteps && (
              <Button variant="outline" onClick={handleNext}>Skip</Button>
            )}
            {step < totalSteps - 1 ? (
              <Button onClick={handleNext}>Next</Button>
            ) : step === totalSteps - 1 ? (
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
