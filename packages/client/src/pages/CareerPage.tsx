import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Notice } from '@/components/ui/notice';
import { Briefcase, Loader2, Info } from 'lucide-react';
import { extractSkillsTool } from '@/lib/agent-tools/extract-skills';
import { rankCoursesForSkills, type RankedCourse, type SkillCourseMap } from '@/lib/career';
import { usePlan } from '@/context/PlanContext';
import { useCatalogRecord } from '@/context/DataContext';

export default function CareerPage() {
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [rankedCourses, setRankedCourses] = useState<RankedCourse[]>([]);
  const [skillMap, setSkillMap] = useState<SkillCourseMap | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const plan = usePlan();
  const catalog = useCatalogRecord();

  useEffect(() => {
    // Load skill map data
    fetch('/data/skill-course-map.json')
      .then(res => res.json())
      .then(data => setSkillMap(data))
      .catch(err => console.error('Failed to load skill map', err));
  }, []);

  const handleAnalyze = async () => {
    if (!jobDescription.trim() || !skillMap) return;
    
    setIsAnalyzing(true);
    setSkills([]);
    setRankedCourses([]);
    setAnalyzeError(null);

    try {
      const result = await extractSkillsTool.fn({} as any, { job_description: jobDescription });
      const extractedSkills = (result.content as { skills: string[] }).skills;

      setSkills(extractedSkills);

      const existingCourses = Object.values(plan).flat();
      const ranked = rankCoursesForSkills(extractedSkills, skillMap, existingCourses);

      setRankedCourses(ranked);
    } catch (err) {
      console.error('Analysis failed', err);
      setAnalyzeError('Skill extraction failed. Most common cause: the server is not running or the AI API key is missing.');
    } finally {
      setIsAnalyzing(false);
    }
  };

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

        <Card className="shadow-sm">
          <CardContent className="p-4 space-y-4">
            <textarea
              className="w-full min-h-[200px] p-3 rounded-md border bg-background text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Paste the job description here (e.g., 'Looking for a firmware engineer with RTOS, embedded systems, and C++ experience...')"
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
            />
            {analyzeError && (
              <Notice
                variant="error"
                message={analyzeError}
                action={{ label: 'Retry', onClick: () => { setAnalyzeError(null); handleAnalyze(); } }}
                onDismiss={() => setAnalyzeError(null)}
              />
            )}
            <div className="flex justify-end">
              <Button onClick={handleAnalyze} disabled={isAnalyzing || !jobDescription.trim()}>
                {isAnalyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Analyze Description
              </Button>
            </div>
          </CardContent>
        </Card>

        {(skills.length > 0 || rankedCourses.length > 0) && (
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
              <h3 className="text-lg font-semibold tracking-tight">Recommended Courses</h3>
              
              {rankedCourses.length === 0 ? (
                <div className="p-8 text-center border rounded-lg border-dashed text-muted-foreground">
                  <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No courses matched the extracted skills.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {rankedCourses.map((rc, idx) => {
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
