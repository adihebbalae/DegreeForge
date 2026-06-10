import { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { UserProfile } from '@/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

type CompletedCourse = UserProfile['completed_courses'][number];
type InProgressCourse = UserProfile['in_progress_courses'][number];

export const EMPTY_COMPLETED: CompletedCourse = {
  course: '',
  title: '',
  grade: '',
  semester: '',
  type: 'In residence',
  credit_hours: 3,
};

export const EMPTY_INPROGRESS: InProgressCourse = {
  course: '',
  title: '',
  semester: '',
  credit_hours: 3,
};

// ─── Input primitive matching SettingsPage style ───────────────────────────────

function FieldInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className = '',
  'aria-label': ariaLabel,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
    />
  );
}

// ─── Completed Course Row ──────────────────────────────────────────────────────

function CompletedCourseRow({
  course,
  index,
  onUpdate,
  onRemove,
}: {
  course: CompletedCourse;
  index: number;
  onUpdate: (index: number, course: CompletedCourse) => void;
  onRemove: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CompletedCourse>(course);

  const handleSave = () => {
    onUpdate(index, draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(course);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-muted/40 group">
        <span className="font-mono text-xs text-foreground w-20 shrink-0">{course.course || '—'}</span>
        <span className="text-xs text-muted-foreground flex-1 truncate min-w-0">{course.title || '—'}</span>
        <span className="text-xs text-muted-foreground w-24 shrink-0">{course.semester}</span>
        <span className="text-xs text-muted-foreground w-8 shrink-0 text-center">{course.grade}</span>
        <span className="text-xs text-muted-foreground w-8 shrink-0 text-center">{course.credit_hours}h</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => { setDraft(course); setEditing(true); }}
            aria-label={`Edit ${course.course}`}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(index)}
            aria-label={`Remove ${course.course}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded border border-primary/30 bg-muted/60">
      <FieldInput
        value={draft.course}
        onChange={(v) => setDraft((d) => ({ ...d, course: v }))}
        placeholder="ECE 302"
        aria-label="Course code"
        className="w-24"
      />
      <FieldInput
        value={draft.title}
        onChange={(v) => setDraft((d) => ({ ...d, title: v }))}
        placeholder="Course title"
        aria-label="Course title"
        className="flex-1 min-w-[120px]"
      />
      <FieldInput
        value={draft.semester}
        onChange={(v) => setDraft((d) => ({ ...d, semester: v }))}
        placeholder="Fall 2025"
        aria-label="Semester"
        className="w-24"
      />
      <FieldInput
        value={draft.grade}
        onChange={(v) => setDraft((d) => ({ ...d, grade: v }))}
        placeholder="A"
        aria-label="Grade"
        className="w-14"
      />
      <FieldInput
        value={draft.credit_hours}
        onChange={(v) => setDraft((d) => ({ ...d, credit_hours: Number(v) || 0 }))}
        placeholder="3"
        type="number"
        aria-label="Credit hours"
        className="w-14"
      />
      <FieldInput
        value={draft.type}
        onChange={(v) => setDraft((d) => ({ ...d, type: v }))}
        placeholder="In residence"
        aria-label="Type"
        className="w-28"
      />
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={handleSave} aria-label="Save">
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={handleCancel} aria-label="Cancel edit">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Add Completed Course Row ──────────────────────────────────────────────────

function AddCompletedCourseRow({ onAdd }: { onAdd: (course: CompletedCourse) => void }) {
  const [draft, setDraft] = useState<CompletedCourse>(EMPTY_COMPLETED);

  const handleAdd = () => {
    if (!draft.course.trim()) return;
    onAdd(draft);
    setDraft(EMPTY_COMPLETED);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded border border-dashed border-border bg-muted/20">
      <FieldInput
        value={draft.course}
        onChange={(v) => setDraft((d) => ({ ...d, course: v }))}
        placeholder="ECE 302"
        aria-label="New completed course code"
        className="w-24"
      />
      <FieldInput
        value={draft.title}
        onChange={(v) => setDraft((d) => ({ ...d, title: v }))}
        placeholder="Course title"
        aria-label="New completed course title"
        className="flex-1 min-w-[120px]"
      />
      <FieldInput
        value={draft.semester}
        onChange={(v) => setDraft((d) => ({ ...d, semester: v }))}
        placeholder="Fall 2025"
        aria-label="New completed semester"
        className="w-24"
      />
      <FieldInput
        value={draft.grade}
        onChange={(v) => setDraft((d) => ({ ...d, grade: v }))}
        placeholder="A"
        aria-label="New completed grade"
        className="w-14"
      />
      <FieldInput
        value={draft.credit_hours}
        onChange={(v) => setDraft((d) => ({ ...d, credit_hours: Number(v) || 0 }))}
        placeholder="3"
        type="number"
        aria-label="New completed credit hours"
        className="w-14"
      />
      <FieldInput
        value={draft.type}
        onChange={(v) => setDraft((d) => ({ ...d, type: v }))}
        placeholder="In residence"
        aria-label="New completed type"
        className="w-28"
      />
      <Button
        variant="outline"
        size="sm"
        className="gap-1 h-8"
        onClick={handleAdd}
        disabled={!draft.course.trim()}
        aria-label="Add completed course"
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </Button>
    </div>
  );
}

// ─── In-Progress Course Row ────────────────────────────────────────────────────

function InProgressCourseRow({
  course,
  index,
  onUpdate,
  onRemove,
}: {
  course: InProgressCourse;
  index: number;
  onUpdate: (index: number, course: InProgressCourse) => void;
  onRemove: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<InProgressCourse>(course);

  const handleSave = () => {
    onUpdate(index, draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(course);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-950/20 group">
        <span className="font-mono text-xs text-foreground w-20 shrink-0">{course.course || '—'}</span>
        <span className="text-xs text-muted-foreground flex-1 truncate min-w-0">{course.title || '—'}</span>
        <span className="text-xs text-muted-foreground w-24 shrink-0">{course.semester}</span>
        <span className="text-xs text-muted-foreground w-8 shrink-0 text-center">{course.credit_hours}h</span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => { setDraft(course); setEditing(true); }}
            aria-label={`Edit ${course.course}`}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(index)}
            aria-label={`Remove ${course.course}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded border border-primary/30 bg-muted/60">
      <FieldInput
        value={draft.course}
        onChange={(v) => setDraft((d) => ({ ...d, course: v }))}
        placeholder="ECE 312H"
        aria-label="Course code"
        className="w-24"
      />
      <FieldInput
        value={draft.title}
        onChange={(v) => setDraft((d) => ({ ...d, title: v }))}
        placeholder="Course title"
        aria-label="Course title"
        className="flex-1 min-w-[120px]"
      />
      <FieldInput
        value={draft.semester}
        onChange={(v) => setDraft((d) => ({ ...d, semester: v }))}
        placeholder="Spring 2026"
        aria-label="Semester"
        className="w-24"
      />
      <FieldInput
        value={draft.credit_hours}
        onChange={(v) => setDraft((d) => ({ ...d, credit_hours: Number(v) || 0 }))}
        placeholder="3"
        type="number"
        aria-label="Credit hours"
        className="w-14"
      />
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={handleSave} aria-label="Save">
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={handleCancel} aria-label="Cancel edit">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Add In-Progress Course Row ────────────────────────────────────────────────

function AddInProgressCourseRow({ onAdd }: { onAdd: (course: InProgressCourse) => void }) {
  const [draft, setDraft] = useState<InProgressCourse>(EMPTY_INPROGRESS);

  const handleAdd = () => {
    if (!draft.course.trim()) return;
    onAdd(draft);
    setDraft(EMPTY_INPROGRESS);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded border border-dashed border-border bg-muted/20">
      <FieldInput
        value={draft.course}
        onChange={(v) => setDraft((d) => ({ ...d, course: v }))}
        placeholder="ECE 312H"
        aria-label="New in-progress course code"
        className="w-24"
      />
      <FieldInput
        value={draft.title}
        onChange={(v) => setDraft((d) => ({ ...d, title: v }))}
        placeholder="Course title"
        aria-label="New in-progress course title"
        className="flex-1 min-w-[120px]"
      />
      <FieldInput
        value={draft.semester}
        onChange={(v) => setDraft((d) => ({ ...d, semester: v }))}
        placeholder="Spring 2026"
        aria-label="New in-progress semester"
        className="w-24"
      />
      <FieldInput
        value={draft.credit_hours}
        onChange={(v) => setDraft((d) => ({ ...d, credit_hours: Number(v) || 0 }))}
        placeholder="3"
        type="number"
        aria-label="New in-progress credit hours"
        className="w-14"
      />
      <Button
        variant="outline"
        size="sm"
        className="gap-1 h-8"
        onClick={handleAdd}
        disabled={!draft.course.trim()}
        aria-label="Add in-progress course"
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </Button>
    </div>
  );
}

// ─── CourseListEditor ──────────────────────────────────────────────────────────

export interface CourseListEditorProps {
  completedCourses: CompletedCourse[];
  inProgressCourses: InProgressCourse[];
  onAddCompleted: (course: CompletedCourse) => void;
  onUpdateCompleted: (index: number, course: CompletedCourse) => void;
  onRemoveCompleted: (index: number) => void;
  onAddInProgress: (course: InProgressCourse) => void;
  onUpdateInProgress: (index: number, course: InProgressCourse) => void;
  onRemoveInProgress: (index: number) => void;
}

/**
 * Editable tables for completed and in-progress courses.
 * Props-driven so it can be tested in isolation without a full Provider tree.
 */
export function CourseListEditor({
  completedCourses,
  inProgressCourses,
  onAddCompleted,
  onUpdateCompleted,
  onRemoveCompleted,
  onAddInProgress,
  onUpdateInProgress,
  onRemoveInProgress,
}: CourseListEditorProps) {
  return (
    <div className="space-y-6">
      {/* ── Completed Courses ─────────────────────────────────────────── */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-2">
          Completed ({completedCourses.length})
        </Label>

        {completedCourses.length > 0 && (
          <div className="space-y-1 mb-2">
            {completedCourses.map((c, i) => (
              <CompletedCourseRow
                key={i}
                course={c}
                index={i}
                onUpdate={onUpdateCompleted}
                onRemove={onRemoveCompleted}
              />
            ))}
          </div>
        )}

        {completedCourses.length === 0 && (
          <p className="text-sm text-muted-foreground italic mb-2">No completed courses yet.</p>
        )}

        <AddCompletedCourseRow onAdd={onAddCompleted} />
      </div>

      {/* ── In-Progress Courses ───────────────────────────────────────── */}
      <div>
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground block mb-2">
          In Progress ({inProgressCourses.length})
        </Label>

        {inProgressCourses.length > 0 && (
          <div className="space-y-1 mb-2">
            {inProgressCourses.map((c, i) => (
              <InProgressCourseRow
                key={i}
                course={c}
                index={i}
                onUpdate={onUpdateInProgress}
                onRemove={onRemoveInProgress}
              />
            ))}
          </div>
        )}

        {inProgressCourses.length === 0 && (
          <p className="text-sm text-muted-foreground italic mb-2">No in-progress courses.</p>
        )}

        <AddInProgressCourseRow onAdd={onAddInProgress} />
      </div>
    </div>
  );
}
