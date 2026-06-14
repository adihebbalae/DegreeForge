import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePlanContext } from '@/context/PlanContext';

interface SemesterTransitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const UT_GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'CR', 'Q', 'W'];

export default function SemesterTransitionDialog({ open, onOpenChange }: SemesterTransitionDialogProps) {
  const { state, dispatch } = usePlanContext();
  const [grades, setGrades] = useState<Record<string, string>>({});

  const currentIdx = state.semesters.findIndex((s) => s.status === 'current');
  const currentSem = currentIdx >= 0 ? state.semesters[currentIdx] : null;
  const nextFutureIdx = state.semesters.findIndex((s) => s.status === 'future');
  const nextSem = nextFutureIdx >= 0 ? state.semesters[nextFutureIdx] : null;

  const currentCourses = currentSem ? state.plan[currentSem.id] || [] : [];

  const handleGradeChange = (courseId: string, grade: string) => {
    setGrades((prev) => ({ ...prev, [courseId]: grade }));
  };

  const handleConfirm = () => {
    dispatch({ type: 'ADVANCE_SEMESTER', grades });
    onOpenChange(false);
    setGrades({}); // Reset
  };

  // If no current semester or no future semester to transition to
  if (!currentSem || !nextSem) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cannot Advance Semester</DialogTitle>
            <DialogDescription>
              There is no current semester or no future semester to advance to.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Advance to Next Semester</DialogTitle>
          <DialogDescription>
            {currentSem.label} is ending. Enter your final grades to save them to your transcript.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 flex flex-col gap-4">
          {currentCourses.length > 0 ? (
            <div className="flex flex-col gap-3 border border-border rounded-md p-3 bg-muted/20">
              <h4 className="text-sm font-medium text-foreground">{currentSem.label} Courses</h4>
              {currentCourses.map((courseId) => (
                <div key={courseId} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{courseId}</span>
                  <select
                    className="w-24 px-2 py-1 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                    value={grades[courseId] || ''}
                    onChange={(e) => handleGradeChange(courseId, e.target.value)}
                  >
                    <option value="" disabled>Grade...</option>
                    {UT_GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              No courses scheduled for {currentSem.label}.
            </div>
          )}

          <div className="bg-accent/40 dark:bg-accent/20 p-3 rounded-md border border-primary/20 flex items-center justify-between">
            <span className="text-sm text-foreground/70">Next semester is:</span>
            <span className="text-sm font-bold text-foreground">{nextSem.label}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm & Advance</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
