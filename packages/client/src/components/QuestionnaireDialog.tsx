import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, HelpCircle } from 'lucide-react';
import { useUserProfile, useTechCoresRecord } from '@/context/DataContext';
import { useGradeEntries } from '@/context/PlanContext';

interface QuestionnaireDialogProps {
  onComplete: (combinedAnswers: string) => void;
}

export function QuestionnaireDialog({ onComplete }: QuestionnaireDialogProps) {
  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  
  const profile = useUserProfile();
  const techCores = useTechCoresRecord();
  const gradeEntries = useGradeEntries();

  const handleOpenChange = async (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen && questions.length === 0) {
      setIsGenerating(true);
      try {
        const response = await fetch('/api/generate-questionnaire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile, gradeEntries, techCores }),
        });
        if (!response.ok) throw new Error('Failed to generate questions');
        const data = await response.json();
        setQuestions(data.questions || []);
      } catch (err) {
        console.error(err);
        setQuestions(["What are your favorite subjects?", "What are your career goals?", "Do you prefer hardware or software?"]);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const handleSubmit = () => {
    const combined = questions.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join('\n\n');
    onComplete(combined);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-muted-foreground flex items-center justify-center gap-2">
          <HelpCircle className="h-3 w-3" />
          Unsure? Take the AI Questionnaire
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>AI Career Questionnaire</DialogTitle>
          <DialogDescription>
            Answer a few quick questions generated based on your transcript to help us recommend the perfect track.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <p>Analyzing your transcript...</p>
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={i} className="space-y-2">
                <Label className="text-sm font-medium">{q}</Label>
                <Textarea 
                  placeholder="Your answer..."
                  value={answers[i] || ''}
                  onChange={(e) => {
                    const newAnswers = [...answers];
                    newAnswers[i] = e.target.value;
                    setAnswers(newAnswers);
                  }}
                  className="min-h-[60px] resize-none"
                />
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isGenerating || answers.some(a => !a.trim())}>
            Submit Answers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
