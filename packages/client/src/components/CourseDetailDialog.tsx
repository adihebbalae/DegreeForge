import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, Book, Users, Link as LinkIcon, TrendingUp, Calendar, Sparkles, FileText, BookOpen } from 'lucide-react';
import { getCourseTitle, getCourseCredits, gpaColorClass, inferCategory, buildTranscriptCredits } from '@/lib/course-utils';
import { getRelatedCourses } from '@/lib/related-courses';
import { isGradingPlausible, dedupeTextbooks } from '@/lib/syllabus-display';
import type { CourseCatalog, PrereqNode, GradeDistributions, FallSections, CourseSection } from '@/types';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import { useFallSections, useUserProfile, useTechCoresRecord, useSyllabi } from '@/context/DataContext';
import { useUi } from '@/context/UiContext';

interface CourseDetailDialogProps {
  courseId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: CourseCatalog | null;
  gradeDistributions: GradeDistributions;
  prereqNodes: Record<string, PrereqNode>;
}

export default function CourseDetailDialog({
  courseId,
  open,
  onOpenChange,
  catalog,
  gradeDistributions,
  prereqNodes,
}: CourseDetailDialogProps) {
  const prereqGraph = usePrereqGraph();
  const profile = useUserProfile();
  const techCores = useTechCoresRecord();
  const transcriptCredits = useMemo(() => buildTranscriptCredits(profile), [profile]);
  const syllabiMap = useSyllabi();
  const { setDetailDialogOpen } = useUi();

  // Sync open state into UiContext so PlannerPage can disable dnd sensors
  // while the dialog is visible. The cleanup always resets to false so dnd
  // is never left disabled if the component unmounts unexpectedly.
  useEffect(() => {
    setDetailDialogOpen(open);
    return () => setDetailDialogOpen(false);
  }, [open, setDetailDialogOpen]);

  const fallSectionsList = useFallSections();

  // "You may also like" can re-target the dialog at a related course without
  // unmounting it. `navCourseId` is the course currently shown; it starts as the
  // prop and is reset whenever the dialog (re)opens or the parent's course changes.
  const [navCourseId, setNavCourseId] = useState<string | null>(courseId);
  useEffect(() => {
    if (open) setNavCourseId(courseId);
  }, [courseId, open]);
  const activeCourseId = navCourseId ?? courseId;

  const related = useMemo(
    () => (activeCourseId ? getRelatedCourses(activeCourseId, techCores) : []),
    [activeCourseId, techCores]
  );

  const details = useMemo(() => {
    if (!activeCourseId) return null;
    const courseId = activeCourseId;
    const cat = catalog?.[courseId];
    const node = prereqNodes[courseId];
    const grade = gradeDistributions[courseId];

    const prereqs = prereqGraph.getPrereqs(courseId);
    const coreqs = prereqGraph.getCoreqs(courseId);
    const downstream = prereqGraph.getDownstream(courseId);
    const category = inferCategory(courseId, prereqNodes);

    // Fall 2026 section info
    const courseSections = fallSectionsList.find((cs) => cs.course === courseId);
    const activeSections = courseSections?.sections.filter(
      (s) => s.status !== 'cancelled'
    ) ?? [];

    // Get first non-Staff instructor for RMP link
    const primaryInstructor = activeSections.find(
      (s) => s.instructor && s.instructor !== 'Staff'
    )?.instructor ?? null;

    return {
      id: courseId,
      title: getCourseTitle(courseId, catalog, prereqNodes),
      credits: getCourseCredits(courseId, catalog, transcriptCredits),
      description: cat?.description ?? 'No description available.',
      category,
      avgGpa: grade?.avg_gpa ?? null,
      totalEnrollment: grade?.total_enrollment ?? 0,
      prereqs,
      coreqs,
      downstream,
      gradeData: grade,
      activeSections,
      primaryInstructor,
    };
  }, [activeCourseId, catalog, gradeDistributions, prereqNodes, prereqGraph, fallSectionsList, transcriptCredits]);

  // Look up the scraped past-syllabus entry for the active course.
  // May be null if syllabi.json didn't load or has no entry for this course.
  const syllabusEntry = syllabiMap ? (syllabiMap[activeCourseId ?? ''] ?? null) : null;

  if (!details) return null;

  // Build RMP link — use instructor name if available, otherwise search by course
  const rmpQuery = details.primaryInstructor
    ? encodeURIComponent(details.primaryInstructor)
    : encodeURIComponent(details.id);

  const externalLinks = [
    {
      label: details.primaryInstructor
        ? `RMP: ${details.primaryInstructor.split(' ').slice(-1)[0]}`
        : 'RateMyProfessors',
      icon: Users,
      url: `https://www.ratemyprofessors.com/search/teachers?query=${rmpQuery}&schoolID=1255`,
    },
    {
      label: 'UTGradesPlus',
      icon: TrendingUp,
      url: `https://www.utgradesplus.com/?query=${details.id.replace(' ', '+').toLowerCase()}&disp=frequency&agg=false&multi=false`,
    },
    {
      label: 'Past Syllabi',
      icon: Book,
      url: (() => {
        // Deep-link to the coursedocs search for this specific course.
        // Pattern: course_number = everything after the first space in the course ID
        // (e.g. "ECE 460N" → "460N", "M 325K" → "325K").
        const spaceIdx = details.id.indexOf(' ');
        const courseNumber = spaceIdx >= 0 ? details.id.slice(spaceIdx + 1) : details.id;
        return (
          `https://utdirect.utexas.edu/apps/student/coursedocs/?` +
          `course_number=${encodeURIComponent(courseNumber)}` +
          `&course_title=${encodeURIComponent(details.title)}` +
          `&course_type=In+Residence&search=`
        );
      })(),
    },
    {
      label: 'CIS Surveys',
      icon: LinkIcon,
      url: `https://utexas.bluera.com/utexas/`,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <Badge variant="outline" className="text-xs font-bold uppercase tracking-wider">
              {details.id}
            </Badge>
            {details.avgGpa !== null && (
              <Badge className={gpaColorClass(details.avgGpa)}>
                Avg GPA: {details.avgGpa.toFixed(2)}
              </Badge>
            )}
          </div>
          <DialogTitle className="text-2xl font-bold">{details.title}</DialogTitle>
          <DialogDescription className="text-sm">
            {details.credits} Credit Hours • {details.category.replace('_', ' ').toUpperCase()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Description */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Book className="w-4 h-4" /> Description
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {details.description}
            </p>
          </div>

          <Separator />

          {/* Prereq / Downstream Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Requirements</h4>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Prerequisites</p>
                  <div className="flex flex-wrap gap-1">
                    {details.prereqs.length > 0 ? (
                      details.prereqs.map(p => (
                        <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">None</span>
                    )}
                  </div>
                </div>
                {details.coreqs.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Corequisites</p>
                    <div className="flex flex-wrap gap-1">
                      {details.coreqs.map(c => (
                        <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold">Unlocks</h4>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Downstream Dependents</p>
                <div className="flex flex-wrap gap-1">
                  {details.downstream.length > 0 ? (
                    details.downstream.slice(0, 10).map(d => (
                      <Badge key={d} variant="outline" className="text-[10px]">{d}</Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Terminal course (none)</span>
                  )}
                  {details.downstream.length > 10 && (
                    <span className="text-[10px] text-muted-foreground ml-1">+{details.downstream.length - 10} more</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Grade Distribution Mini-Chart */}
          {details.gradeData && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Grade Distribution
              </h4>
              <div className="space-y-2 bg-muted/30 p-4 rounded-lg">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-muted-foreground">Based on {details.totalEnrollment} total students</span>
                  <span className="font-bold">Avg GPA: {details.avgGpa?.toFixed(2)}</span>
                </div>
                <div className="flex h-8 w-full rounded overflow-hidden">
                  <div className="bg-green-500 h-full" style={{ width: `${details.gradeData.a_pct}%` }} title={`A: ${details.gradeData.a_pct}%`} />
                  <div className="bg-green-400 h-full" style={{ width: `${details.gradeData.b_pct}%` }} title={`B: ${details.gradeData.b_pct}%`} />
                  <div className="bg-yellow-400 h-full" style={{ width: `${details.gradeData.c_pct}%` }} title={`C: ${details.gradeData.c_pct}%`} />
                  <div className="bg-orange-400 h-full" style={{ width: `${details.gradeData.d_pct}%` }} title={`D: ${details.gradeData.d_pct}%`} />
                  <div className="bg-red-500 h-full" style={{ width: `${details.gradeData.f_pct}%` }} title={`F: ${details.gradeData.f_pct}%`} />
                </div>
                <div className="flex justify-between text-[10px] font-bold mt-1 px-1">
                  <span className="text-green-600">A ({details.gradeData.a_pct}%)</span>
                  <span className="text-red-600">F ({details.gradeData.f_pct}%)</span>
                </div>
              </div>
            </div>
          )}

          {/* Fall 2026 Section Info */}
          {details.activeSections.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Fall 2026 Sections
                </h4>
                <div className="space-y-2">
                  {details.activeSections.slice(0, 5).map((section) => (
                    <div
                      key={section.unique}
                      className="flex items-start gap-3 p-2 rounded-md bg-muted/30 text-xs"
                    >
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                        {section.unique}
                      </Badge>
                      <div className="flex-1 space-y-0.5">
                        <p className="font-medium">{section.instructor}</p>
                        {section.meetings.map((m, idx) => (
                          <p key={idx} className="text-muted-foreground">
                            {m.days ? `${m.days} ` : ''}{m.time}
                            {m.room ? ` — ${m.room}` : ''}
                          </p>
                        ))}
                        <p className="text-muted-foreground/70">
                          {section.instruction_mode} • {section.status}
                        </p>
                      </div>
                    </div>
                  ))}
                  {details.activeSections.length > 5 && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      +{details.activeSections.length - 5} more sections
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Past syllabus enrichment — displayed when scraped data exists */}
          {syllabusEntry && (
            <>
              <Separator />
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4" /> From a past syllabus
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {syllabusEntry.term} · taught by {syllabusEntry.instructor}
                  </p>
                </div>

                {/* 1. PDF link — only when pdfUrl is a safe http/https URL */}
                {syllabusEntry.pdfUrl.startsWith('http') && (
                  <a
                    href={syllabusEntry.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    View full syllabus (PDF)
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                )}

                {/* 2. Grading breakdown — only if plausible [95–105%] */}
                {isGradingPlausible(syllabusEntry.grading) && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Grading breakdown
                    </p>
                    <div className="space-y-1.5 bg-muted/30 rounded-lg p-3">
                      {syllabusEntry.grading.map((item) => (
                        <div key={item.component} className="flex items-center gap-2">
                          <span className="w-28 shrink-0 text-[11px] text-muted-foreground capitalize">
                            {item.component}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/60"
                              style={{ width: `${item.pct}%` }}
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-[11px] font-medium">
                            {item.pct}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Topics — if any */}
                {syllabusEntry.topics.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Topics covered
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {syllabusEntry.topics.slice(0, 8).map((topic) => (
                        <Badge key={topic} variant="secondary" className="text-[10px] font-normal">
                          {topic}
                        </Badge>
                      ))}
                      {syllabusEntry.topics.length > 8 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{syllabusEntry.topics.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* 4. Textbooks — deduped, capped at 3 */}
                {dedupeTextbooks(syllabusEntry.textbooks).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Textbook{dedupeTextbooks(syllabusEntry.textbooks).length > 1 ? 's' : ''}
                    </p>
                    <ul className="space-y-1">
                      {dedupeTextbooks(syllabusEntry.textbooks).map((book) => (
                        <li key={book} className="text-xs text-muted-foreground leading-snug">
                          {book}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          {/* You may also like — related courses in the same tech-core area(s) */}
          {related.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> You may also like
                </h4>
                <div className="space-y-1.5">
                  {related.map((rec) => (
                    <button
                      key={rec.course}
                      type="button"
                      onClick={() => setNavCourseId(rec.course)}
                      className="flex w-full items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
                    >
                      <Badge variant="outline" className="shrink-0 text-[10px] font-mono">
                        {rec.course}
                      </Badge>
                      <span className="flex-1 truncate text-xs font-medium">
                        {getCourseTitle(rec.course, catalog, prereqNodes)}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {rec.reason}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* External Links */}
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ExternalLink className="w-4 h-4" /> Research Further
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {externalLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center justify-center p-3 rounded-md border border-border bg-card hover:bg-accent transition-colors gap-2 text-center"
                >
                  <link.icon className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[10px] font-medium leading-tight">{link.label}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
