import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ExternalLink, Book, Users, Link as LinkIcon, TrendingUp } from 'lucide-react';
import { getCourseTitle, getCourseCredits, gpaColorClass, inferCategory } from '@/lib/course-utils';
import type { CourseCatalog, PrereqNode, GradeDistributions } from '@/types';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';

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

  const details = useMemo(() => {
    if (!courseId) return null;
    const cat = catalog?.[courseId];
    const node = prereqNodes[courseId];
    const grade = gradeDistributions[courseId];
    
    const prereqs = prereqGraph.getPrereqs(courseId);
    const coreqs = prereqGraph.getCoreqs(courseId);
    const downstream = prereqGraph.getDownstream(courseId);
    const category = inferCategory(courseId, prereqNodes);

    return {
      id: courseId,
      title: getCourseTitle(courseId, catalog, prereqNodes),
      credits: getCourseCredits(courseId, catalog, prereqNodes),
      description: cat?.description ?? 'No description available.',
      category,
      avgGpa: grade?.avg_gpa ?? null,
      totalEnrollment: grade?.total_enrollment ?? 0,
      prereqs,
      coreqs,
      downstream,
      gradeData: grade,
    };
  }, [courseId, catalog, gradeDistributions, prereqNodes, prereqGraph]);

  if (!details) return null;

  const externalLinks = [
    {
      label: 'RateMyProfessors',
      icon: Users,
      url: `https://www.ratemyprofessors.com/search/professors?q=${details.id}`,
    },
    {
      label: 'UTGradesPlus',
      icon: TrendingUp,
      url: `https://utgrades.com/search?q=${details.id.replace(' ', '')}`,
    },
    {
      label: 'Past Syllabi',
      icon: Book,
      url: `https://utdirect.utexas.edu/apps/student/coursesyallabi/`,
    },
    {
      label: 'CIS Surveys',
      icon: LinkIcon,
      url: `https://utdirect.utexas.edu/ctl/cis/results/`,
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
