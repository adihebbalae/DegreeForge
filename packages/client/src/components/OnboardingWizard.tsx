import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Notice } from '@/components/ui/notice';
import { useTechCoresRecord } from '@/context/DataContext';
import { useSettingsDispatch, type LoadTolerance } from '@/context/SettingsContext';
import { usePlanDispatch, SEMESTERS } from '@/context/PlanContext';
import { parseTranscript, type ParsedCourse } from '@/lib/agent-tools/parse-transcript';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const techCores = useTechCoresRecord();
  const settingsDispatch = useSettingsDispatch();
  const planDispatch = usePlanDispatch();

  const [step, setStep] = useState(1);
  const totalSteps = 6;

  const [major, setMajor] = useState('ece-bse');
  const [catalogYear, setCatalogYear] = useState('2024');
  const [gradTarget, setGradTarget] = useState('Spring 2028');
  const [loadTolerance, setLoadTolerance] = useState<LoadTolerance>('normal');
  const [techCoreId, setTechCoreId] = useState<string>('skip');
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
      const courses = parseTranscript(transcriptText);
      setIsParsing(false);
      if (courses.length === 0) {
        setTranscriptError(true);
      } else {
        setTranscriptError(false);
        setParsedCourses(courses);
        handleNext();
      }
    } catch {
      setIsParsing(false);
      setTranscriptError(true);
    }
  };

  const handleCommit = () => {
    settingsDispatch({ type: 'SET_GRAD_TARGET', value: gradTarget });
    settingsDispatch({ type: 'SET_LOAD_TOLERANCE', value: loadTolerance });
    if (techCoreId !== 'skip') {
      settingsDispatch({ type: 'SET_TECH_CORE', value: techCoreId });
    }

    planDispatch({ type: 'SET_PROFILE_META', major, catalogYear });

    // Add parsed transcript courses to the plan.
    // Use the semester from the parsed course if it matches a known semester id;
    // otherwise fall back to the earliest 'past' semester.
    const semesterIds = new Set(SEMESTERS.map(s => s.id));
    const fallbackSemesterId = SEMESTERS.find(s => s.status === 'past')?.id ?? SEMESTERS[0].id;
    for (const course of parsedCourses) {
      const semesterId = semesterIds.has(course.semester) ? course.semester : fallbackSemesterId;
      planDispatch({ type: 'ADD_COURSE', semesterId, courseId: course.courseId });
    }

    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <CardTitle>Welcome to DegreeForge</CardTitle>
            <div className="text-sm text-muted-foreground">Step {step} of {totalSteps}</div>
          </div>
          <CardDescription>Let's set up your initial degree plan profile.</CardDescription>
          {/* Stepper */}
          <div className="flex gap-2 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full transition-colors ${i + 1 <= step ? 'bg-blue-500' : 'bg-secondary'}`}
              />
            ))}
          </div>
        </CardHeader>

        <CardContent className="min-h-[300px]">
          {step === 1 && (
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

          {step === 2 && (
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

          {step === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Load Tolerance</h3>
              <p className="text-sm text-muted-foreground">How many credit hours do you prefer to take per semester?</p>
              <div className="space-y-3 mt-4">
                {[
                  { id: 'light', label: 'Light', desc: '12-13 hours' },
                  { id: 'normal', label: 'Normal', desc: '14-15 hours' },
                  { id: 'above_average', label: 'Above Average', desc: '16-17 hours' },
                  { id: 'heavy', label: 'Heavy', desc: '18+ hours' },
                ].map(opt => (
                  <div
                    key={opt.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${loadTolerance === opt.id ? 'border-blue-500 bg-blue-500/10' : 'hover:bg-secondary'}`}
                    onClick={() => setLoadTolerance(opt.id as LoadTolerance)}
                  >
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-sm text-muted-foreground">{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
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

          {step === 5 && (
            <div className="space-y-4 flex flex-col h-full animate-in fade-in slide-in-from-right-4">
              <h3 className="text-lg font-medium">Import Transcript (Optional)</h3>
              <p className="text-sm text-muted-foreground">Paste text from your UT Academic Summary to automatically mark courses as completed.</p>
              <textarea
                className="flex-1 w-full min-h-[150px] p-3 rounded-md border bg-background text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="ECE 302 Intro to Electrical Eng A Fall 2025 3&#10;..."
                value={transcriptText}
                onChange={e => { setTranscriptText(e.target.value); setTranscriptError(false); }}
              />
              {transcriptError && (
                <Notice
                  variant="error"
                  message="Could not parse the transcript. Most common cause: PDF copy-paste lost line breaks."
                  action={{ label: 'Paste plain text', onClick: () => { setTranscriptText(''); setTranscriptError(false); } }}
                  onDismiss={() => setTranscriptError(false)}
                />
              )}
            </div>
          )}

          {step === 6 && (
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
                  <span className="text-muted-foreground">Imported Courses</span>
                  <Badge variant="secondary">{parsedCourses.length} found</Badge>
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
            ) : step === 5 ? (
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
