import { useState } from 'react';
import { Database, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CourseListEditor } from '@/components/CourseListEditor';
import { useOwnedProfile, useProfileDispatch, fetchAndLoadDemo } from '@/context/ProfileContext';
import { usePlanDispatch, SEMESTERS } from '@/context/PlanContext';
import { deriveTimelinePlanFromProfile } from '@/lib/derive-timeline';
import type { UserProfile } from '@/types';

// ─── Field Input ───────────────────────────────────────────────────────────────

function FieldInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  className = '',
}: {
  id?: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  className?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
    />
  );
}

// ─── Field Row ─────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

// ─── ProfileEditor ─────────────────────────────────────────────────────────────

/**
 * Fully editable profile editor rendered inside SettingsPage.
 * Dispatches directly to ProfileContext and PlanContext.
 * graduation_target is intentionally omitted: Settings > Academic owns it
 * (to avoid the Settings/profile desync that the F1 fix addressed for tolerance).
 */
export function ProfileEditor() {
  const profile = useOwnedProfile();
  const profileDispatch = useProfileDispatch();
  const planDispatch = usePlanDispatch();

  const [loadDemoOpen, setLoadDemoOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const [newInterest, setNewInterest] = useState('');

  // ── Dispatch helpers ───────────────────────────────────────────────────────

  function setField<K extends keyof UserProfile>(field: K, value: UserProfile[K]) {
    profileDispatch({ type: 'UPDATE_PROFILE_FIELD', field, value });
  }

  // ── GPA helpers ────────────────────────────────────────────────────────────

  function setGpaField(key: keyof UserProfile['gpa'], raw: string) {
    const num = parseFloat(raw);
    const value = isNaN(num) ? 0 : num;
    setField('gpa', { ...profile.gpa, [key]: value });
  }

  // ── Credit summary helpers ─────────────────────────────────────────────────

  function setCreditField(key: keyof UserProfile['credit_summary'], raw: string) {
    const num = parseFloat(raw);
    const value = isNaN(num) ? 0 : num;
    setField('credit_summary', { ...profile.credit_summary, [key]: value });
  }

  // ── Tech core helpers ──────────────────────────────────────────────────────

  function setTechCoreField(key: keyof UserProfile['tech_core'], raw: string) {
    const value = key === 'tech_electives_needed' ? (parseInt(raw) || 0) : raw;
    setField('tech_core', { ...profile.tech_core, [key]: value });
  }

  // ── Secondary aspirations helpers ──────────────────────────────────────────

  function setAspirationField(
    aspect: keyof UserProfile['secondary_aspirations'],
    key: 'status' | 'notes',
    value: string
  ) {
    setField('secondary_aspirations', {
      ...profile.secondary_aspirations,
      [aspect]: { ...profile.secondary_aspirations[aspect], [key]: value },
    });
  }

  // ── Career interests helpers ───────────────────────────────────────────────

  function addInterest() {
    const trimmed = newInterest.trim();
    if (!trimmed) return;
    setField('career_interests', [...profile.career_interests, trimmed]);
    setNewInterest('');
  }

  function removeInterest(idx: number) {
    setField('career_interests', profile.career_interests.filter((_, i) => i !== idx));
  }

  // ── Demo / Clear ───────────────────────────────────────────────────────────

  async function handleLoadDemo() {
    setDemoLoading(true);
    try {
      const demo = await fetchAndLoadDemo(profileDispatch);
      planDispatch({
        type: 'SET_PLAN',
        plan: deriveTimelinePlanFromProfile(demo, SEMESTERS),
      });
    } finally {
      setDemoLoading(false);
    }
  }

  function handleClear() {
    profileDispatch({ type: 'CLEAR_PROFILE' });
    planDispatch({ type: 'RESET_PLAN' });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Data Actions */}
      <div className="flex flex-wrap gap-3 p-4 rounded-lg border border-border bg-muted/30">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-medium text-foreground mb-0.5">Demo data</p>
          <p className="text-xs text-muted-foreground">Load Adi's profile and timeline to explore the app with real data.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setLoadDemoOpen(true)}
            disabled={demoLoading}
            aria-label="Load demo profile"
          >
            {demoLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Database className="h-3.5 w-3.5" />
            )}
            Load demo profile (Adi)
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:hover:bg-red-950/30"
            onClick={() => setClearOpen(true)}
            aria-label="Clear all data"
          >
            Clear all / start fresh
          </Button>
        </div>
      </div>

      {/* Identity & Academic */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Identity</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Name" htmlFor="profile-name">
            <FieldInput
              id="profile-name"
              value={profile.name}
              onChange={(v) => setField('name', v)}
              placeholder="Your full name"
            />
          </FieldRow>
          <FieldRow label="EID" htmlFor="profile-eid">
            <FieldInput
              id="profile-eid"
              value={profile.eid}
              onChange={(v) => setField('eid', v)}
              placeholder="abc123"
            />
          </FieldRow>
          <FieldRow label="University" htmlFor="profile-university">
            <FieldInput
              id="profile-university"
              value={profile.university}
              onChange={(v) => setField('university', v)}
              placeholder="The University of Texas at Austin"
            />
          </FieldRow>
          <FieldRow label="Major" htmlFor="profile-major">
            <FieldInput
              id="profile-major"
              value={profile.major}
              onChange={(v) => setField('major', v)}
              placeholder="ece-bse"
            />
          </FieldRow>
          <FieldRow label="Catalog Year" htmlFor="profile-catalog-year">
            <FieldInput
              id="profile-catalog-year"
              value={profile.catalog_year}
              onChange={(v) => setField('catalog_year', v)}
              placeholder="2024"
            />
          </FieldRow>
          <FieldRow label="Classification" htmlFor="profile-classification">
            <FieldInput
              id="profile-classification"
              value={profile.classification}
              onChange={(v) => setField('classification', v)}
              placeholder="Junior"
            />
          </FieldRow>
          <FieldRow label="First Semester" htmlFor="profile-first-semester">
            <FieldInput
              id="profile-first-semester"
              value={profile.first_semester}
              onChange={(v) => setField('first_semester', v)}
              placeholder="Fall 2024"
            />
          </FieldRow>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Target graduation is set in <span className="font-medium">Academic &gt; Target Graduation</span> above.
        </p>
      </div>

      {/* GPA */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">GPA</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FieldRow label="Cumulative" htmlFor="gpa-cumulative">
            <FieldInput
              id="gpa-cumulative"
              type="number"
              value={profile.gpa.cumulative}
              onChange={(v) => setGpaField('cumulative', v)}
              placeholder="3.5"
            />
          </FieldRow>
          <FieldRow label="Lower Division" htmlFor="gpa-lower">
            <FieldInput
              id="gpa-lower"
              type="number"
              value={profile.gpa.lower_division}
              onChange={(v) => setGpaField('lower_division', v)}
              placeholder="3.6"
            />
          </FieldRow>
          <FieldRow label="Upper Division" htmlFor="gpa-upper">
            <FieldInput
              id="gpa-upper"
              type="number"
              value={profile.gpa.upper_division}
              onChange={(v) => setGpaField('upper_division', v)}
              placeholder="3.4"
            />
          </FieldRow>
          <FieldRow label="GPA Hours" htmlFor="gpa-hours">
            <FieldInput
              id="gpa-hours"
              type="number"
              value={profile.gpa.gpa_hours}
              onChange={(v) => setGpaField('gpa_hours', v)}
              placeholder="45"
            />
          </FieldRow>
          <FieldRow label="Grade Points" htmlFor="gpa-grade-points">
            <FieldInput
              id="gpa-grade-points"
              type="number"
              value={profile.gpa.grade_points}
              onChange={(v) => setGpaField('grade_points', v)}
              placeholder="157.5"
            />
          </FieldRow>
        </div>
      </div>

      {/* Credit Summary */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Credit Summary</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FieldRow label="Hours Transferred" htmlFor="credit-transferred">
            <FieldInput
              id="credit-transferred"
              type="number"
              value={profile.credit_summary.total_hours_transferred}
              onChange={(v) => setCreditField('total_hours_transferred', v)}
              placeholder="0"
            />
          </FieldRow>
          <FieldRow label="Hours Taken" htmlFor="credit-taken">
            <FieldInput
              id="credit-taken"
              type="number"
              value={profile.credit_summary.total_hours_taken}
              onChange={(v) => setCreditField('total_hours_taken', v)}
              placeholder="45"
            />
          </FieldRow>
          <FieldRow label="Total Hours" htmlFor="credit-total">
            <FieldInput
              id="credit-total"
              type="number"
              value={profile.credit_summary.total_hours}
              onChange={(v) => setCreditField('total_hours', v)}
              placeholder="45"
            />
          </FieldRow>
        </div>
      </div>

      {/* Tech Core */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Tech Core Declaration</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldRow label="Declared Track" htmlFor="tech-core-declared">
            <FieldInput
              id="tech-core-declared"
              value={profile.tech_core.declared}
              onChange={(v) => setTechCoreField('declared', v)}
              placeholder="computer_architecture_embedded_systems"
            />
          </FieldRow>
          <FieldRow label="Status" htmlFor="tech-core-status">
            <FieldInput
              id="tech-core-status"
              value={profile.tech_core.status}
              onChange={(v) => setTechCoreField('status', v)}
              placeholder="declared"
            />
          </FieldRow>
          <FieldRow label="Required Math" htmlFor="tech-core-math">
            <FieldInput
              id="tech-core-math"
              value={profile.tech_core.required_math}
              onChange={(v) => setTechCoreField('required_math', v)}
              placeholder="M 427J"
            />
          </FieldRow>
          <FieldRow label="Electives Needed" htmlFor="tech-core-electives">
            <FieldInput
              id="tech-core-electives"
              type="number"
              value={profile.tech_core.tech_electives_needed}
              onChange={(v) => setTechCoreField('tech_electives_needed', v)}
              placeholder="2"
            />
          </FieldRow>
        </div>
      </div>

      {/* Secondary Aspirations */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Secondary Aspirations</h3>
        <div className="space-y-4">
          {(
            [
              { key: 'math_ba', label: 'Math BA' },
              { key: 'advanced_math_cert', label: 'Advanced Math Certificate' },
              { key: 'jefferson_scholars_cert', label: 'Jefferson Scholars Certificate' },
            ] as const
          ).map(({ key, label }) => (
            <div key={key} className="grid grid-cols-2 gap-3">
              <FieldRow label={`${label} — Status`} htmlFor={`aspiration-${key}-status`}>
                <FieldInput
                  id={`aspiration-${key}-status`}
                  value={profile.secondary_aspirations[key].status}
                  onChange={(v) => setAspirationField(key, 'status', v)}
                  placeholder="considering"
                />
              </FieldRow>
              <FieldRow label="Notes" htmlFor={`aspiration-${key}-notes`}>
                <FieldInput
                  id={`aspiration-${key}-notes`}
                  value={profile.secondary_aspirations[key].notes}
                  onChange={(v) => setAspirationField(key, 'notes', v)}
                  placeholder="Optional notes"
                />
              </FieldRow>
            </div>
          ))}
        </div>
      </div>

      {/* Career Interests */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Career Interests</h3>

        {profile.career_interests.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {profile.career_interests.map((interest, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-muted border border-border text-foreground"
              >
                {interest}
                <button
                  onClick={() => removeInterest(i)}
                  aria-label={`Remove ${interest}`}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {profile.career_interests.length === 0 && (
          <p className="text-sm text-muted-foreground italic mb-3">No career interests added yet.</p>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newInterest}
            onChange={(e) => setNewInterest(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addInterest()}
            placeholder="e.g. embedded systems"
            aria-label="New career interest"
            className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={addInterest}
            disabled={!newInterest.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>

      {/* Coursework */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4">Coursework</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Edit your completed and in-progress courses. Changes flow immediately to progress bars, the solver, and diagnostics.
        </p>
        <CourseListEditor
          completedCourses={profile.completed_courses}
          inProgressCourses={profile.in_progress_courses}
          onAddCompleted={(course) => profileDispatch({ type: 'ADD_COMPLETED_COURSE', course })}
          onUpdateCompleted={(index, course) => profileDispatch({ type: 'UPDATE_COMPLETED_COURSE', index, course })}
          onRemoveCompleted={(index) => profileDispatch({ type: 'REMOVE_COMPLETED_COURSE', index })}
          onAddInProgress={(course) => profileDispatch({ type: 'ADD_INPROGRESS_COURSE', course })}
          onUpdateInProgress={(index, course) => profileDispatch({ type: 'UPDATE_INPROGRESS_COURSE', index, course })}
          onRemoveInProgress={(index) => profileDispatch({ type: 'REMOVE_INPROGRESS_COURSE', index })}
        />
      </div>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={loadDemoOpen}
        onOpenChange={setLoadDemoOpen}
        title="Load demo profile (Adi)"
        consequence="Replaces your current profile and plan with Adi's sample data. Your existing coursework and GPA will be overwritten."
        confirmLabel="Load Demo"
        destructive={false}
        onConfirm={handleLoadDemo}
      />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all data"
        consequence="Removes all completed and in-progress courses, GPA, credit summary, and career interests. Resets the timeline to empty. This cannot be undone."
        confirmLabel="Clear Profile"
        onConfirm={handleClear}
      />
    </div>
  );
}
