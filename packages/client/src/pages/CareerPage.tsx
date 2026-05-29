import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Briefcase, Loader2, Info, Camera } from 'lucide-react';
import { extractSkills } from '@/lib/agent-tools/extract-skills';
import { rankCoursesForSkills, buildSnapshotPlan, type RankedCourse, type SkillCourseMap } from '@/lib/career';
import { usePlan, useSemesters, useSnapshots, useSnapshotDispatch } from '@/context/PlanContext';
import { useCatalogRecord } from '@/context/DataContext';

export default function CareerPage() {
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [rankedCourses, setRankedCourses] = useState<RankedCourse[]>([]);
  const [skillMap, setSkillMap] = useState<SkillCourseMap | null>(null);
  const [skillMapError, setSkillMapError] = useState<string | null>(null);

  const plan = usePlan();
  const semesters = useSemesters();
  const catalog = useCatalogRecord();
  const snapshots = useSnapshots();
  const snapshotDispatch = useSnapshotDispatch();

  useEffect(() => {
    fetch('/data/skill-course-map.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: SkillCourseMap) => setSkillMap(data))
      .catch(() => setSkillMapError('Could not load the skill database. Try reloading the page.'));
  }, []);

  const handleAnalyze = () => {
    if (!jobDescription.trim() || !skillMap) return;

    setIsAnalyzing(true);
    setSkills([]);
    setRankedCourses([]);

    const extractedSkills = extractSkills(jobDescription);
    setSkills(extractedSkills);

    const existingCourses = Object.values(plan).flat();
    const ranked = rankCoursesForSkills(extractedSkills, skillMap, existingCourses);
    setRankedCourses(ranked);

    setIsAnalyzing(false);
  };

  const handleSaveSnapshot = () => {
    const futureSemester = semesters.find(s => s.status === 'future');
    if (!futureSemester) return;
    const snapshotPlan = buildSnapshotPlan(plan, rankedCourses, futureSemester.id);
    snapshotDispatch({ type: 'SAVE_SNAPSHOT', plan: snapshotPlan });
  };

  const snapshotAtCap = snapshots.length >= 3;
  const showResults = skills.length > 0 || rankedCourses.length > 0;

  return (
    <div className="h-full flex flex-col items-center bg-muted/20 p-6 overflow-y-auto">
      <div className="max-w-4xl w-full space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/10 p-2 rounded-md text-blue-600">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Career Aligner</h1>
            <p className="text-muted-foreground text-sm">Paste a job description to discover courses that teach those skills.</p>
          </div>
        </div>

        {skillMapError && (
          <Notice
            variant="error"
            message={skillMapError}
            action={{ label: 'Reload', onClick: () => window.location.reload() }}
            onDismiss={() => setSkillMapError(null)}
          />
        )}

        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-4">
            <textarea
              className="w-full min-h-[200px] p-3 rounded-md border bg-background text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Paste the job description here (e.g., 'Looking for a firmware engineer with RTOS, embedded systems, and C++ experience...')"
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
            />
            <div className="flex justify-end">
              <Button onClick={handleAnalyze} disabled={isAnalyzing || !jobDescription.trim() || !!skillMapError}>
                {isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Analyze Description
              </Button>
            </div>
          </CardContent>
        </Card>

        {showResults && (
          <div className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg flex items-center gap-2">
                  Extracted Skills
                  <Badge variant="secondary" className="ml-2">{skills.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex flex-wrap gap-2">
                {skills.length === 0 ? (
                  <span className="text-sm text-muted-foreground italic">No known technical skills matched.</span>
                ) : (
                  skills.map(skillKey => (
                    <Badge key={skillKey} className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-transparent">
                      {skillMap?.[skillKey]?.label || skillKey}
                    </Badge>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold tracking-tight">Recommended Courses</h3>
                {rankedCourses.length > 0 && (
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveSnapshot}
                      disabled={snapshotAtCap}
                      className="flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      Save as Snapshot
                    </Button>
                    {snapshotAtCap && (
                      <p className="text-xs text-muted-foreground">
                        Snapshot limit reached (3). Delete one from the planner to save more.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {rankedCourses.length === 0 ? (
                <div className="p-8 text-center border rounded-lg border-dashed text-muted-foreground">
                  <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No courses matched the extracted skills.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {rankedCourses.map((rc) => {
                    const courseInfo = catalog?.[rc.courseId];
                    const isPlanned = rc.why === 'Already planned';

                    return (
                      <Card key={rc.courseId} className={`overflow-hidden ${isPlanned ? 'opacity-60 bg-muted/50' : ''}`}>
                        <div className="flex flex-col sm:flex-row">
                          <div className={`p-4 flex items-center justify-center sm:w-20 ${isPlanned ? 'bg-muted border-r' : 'bg-green-500/10 text-green-700 border-r border-green-500/20'}`}>
                            <div className="text-center">
                              <span className="block text-2xl font-bold">{rc.score}</span>
                              <span className="block text-[10px] uppercase font-semibold">Score</span>
                            </div>
                          </div>

                          <div className="p-4 flex-1 space-y-2">
                            <div className="flex justify-between items-start gap-4">
                              <div>
                                <h4 className="font-semibold">{rc.courseId} <span className="font-normal text-muted-foreground">· {courseInfo?.title || 'Unknown Title'}</span></h4>
                                <p className="text-sm text-muted-foreground">{rc.why}</p>
                              </div>
                              {isPlanned && <Badge variant="outline" className="shrink-0 bg-background">Already Planned</Badge>}
                            </div>

                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {rc.matchingSkills.map(s => (
                                <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
