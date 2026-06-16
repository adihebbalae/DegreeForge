import { useRef, useState } from 'react';
import { RotateCcw, X, Plus, User, Sliders, BookOpen, MessageSquare, UserCog, Upload } from 'lucide-react';
import { AI_ENABLED, SCHEDULE_ENABLED } from '@/lib/features';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettings, useSettingsDispatch, type LoadTolerance, type InstructionMode, type TimeWindow, type ChatProvider } from '@/context/SettingsContext';
import { useTechCoresRecord } from '@/context/DataContext';
import { TOOL_REGISTRY } from '@/lib/agent-tools/registry';
import { ProfileEditor } from '@/components/ProfileEditor';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import type { TechCoreTrack } from '@/types';

// ─── Setting Card ────────────────────────────────────────────────────────────
// A single control framed as a card so a section lays out as a horizontal grid
// instead of one tall column. `title`/`description` are optional chrome.

function SettingCard({
  title,
  description,
  className,
  children,
}: {
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      {(title || description) && (
        <CardHeader className="p-4 pb-2">
          {title && <CardTitle className="text-sm font-semibold">{title}</CardTitle>}
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className={cn('p-4', (title || description) && 'pt-2')}>{children}</CardContent>
    </Card>
  );
}

// ─── Weight Slider ─────────────────────────────────────────────────────────────

function WeightSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <Label className="text-sm text-muted-foreground">{label}</Label>
        <span className="text-xs font-mono text-foreground">{(value * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
        aria-label={label}
      />
    </div>
  );
}

// ─── Section model ─────────────────────────────────────────────────────────────
// The TOC and the main panel are driven off one ordered list so they can never
// drift. Flag-gated sections are simply omitted from the list when their flag is
// false, which keeps the TOC reflecting the live section set.

type SectionId = 'academic' | 'scheduler' | 'professor' | 'chat' | 'profile' | 'import';

interface SectionDef {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

// ─── SettingsPage ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const settings = useSettings();
  const dispatch = useSettingsDispatch();
  const techCoresRecord = useTechCoresRecord();

  const [newProfName, setNewProfName] = useState('');
  const [newProfType, setNewProfType] = useState<'prefer' | 'avoid'>('prefer');
  const [resetSettingsOpen, setResetSettingsOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('academic');

  const tocRef = useRef<HTMLDivElement>(null);

  const techCoreList = techCoresRecord
    ? (Object.entries(techCoresRecord) as [string, TechCoreTrack][]).map(([id, track]) => ({
        id,
        name: track.name,
      }))
    : [];

  // Build the live section list. Flag-gated sections are omitted (not hidden) so
  // the TOC, keyboard nav, and the rendered panel all share one source of truth.
  // Scheduler + Professor sit behind SCHEDULE_ENABLED and Chat Tools behind
  // AI_ENABLED (both false for the soft launch); flipping either flag in
  // lib/features.ts re-adds the relevant TOC tab(s) and panel(s).
  const sections: SectionDef[] = [
    { id: 'academic', label: 'Academic', icon: <BookOpen className="h-4 w-4" /> },
    ...(SCHEDULE_ENABLED
      ? ([
          { id: 'scheduler', label: 'Scheduler Preferences', icon: <Sliders className="h-4 w-4" /> },
          { id: 'professor', label: 'Professor Preferences', icon: <User className="h-4 w-4" /> },
        ] as SectionDef[])
      : []),
    ...(AI_ENABLED
      ? ([{ id: 'chat', label: 'Chat Tools', icon: <MessageSquare className="h-4 w-4" /> }] as SectionDef[])
      : []),
    { id: 'profile', label: 'Profile', icon: <UserCog className="h-4 w-4" /> },
    { id: 'import', label: 'Import & Personalize', icon: <Upload className="h-4 w-4" /> },
  ];

  // If the active section is no longer in the live list (e.g. a flag flipped),
  // fall back to the first section.
  const current = sections.find((s) => s.id === activeSection) ?? sections[0];
  const activeId = current.id;

  const handleReset = () => {
    setResetSettingsOpen(true);
  };

  const handleAddProfPref = () => {
    const name = newProfName.trim();
    if (!name) return;
    dispatch({ type: 'ADD_PROF_PREFERENCE', pref: { name, type: newProfType } });
    setNewProfName('');
  };

  // Roving arrow-key navigation across the TOC buttons (vertical rail + horizontal
  // strip both use ArrowUp/Down + ArrowLeft/Right, plus Home/End).
  const handleTocKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (index + 1) % sections.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (index - 1 + sections.length) % sections.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = sections.length - 1;
    else return;
    e.preventDefault();
    setActiveSection(sections[next].id);
    const buttons = tocRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background shrink-0">
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:hover:bg-red-950/30"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to defaults
        </Button>
      </div>

      {/* TOC + content split. Stacks on mobile (TOC becomes a horizontal strip on top). */}
      <div className="flex-1 min-h-0 flex flex-col sm:flex-row overflow-hidden">
        {/* TOC rail */}
        <div
          ref={tocRef}
          role="tablist"
          aria-orientation="vertical"
          aria-label="Settings sections"
          className="shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-background
                     flex sm:flex-col gap-1 p-2 sm:p-3 sm:w-56
                     overflow-x-auto sm:overflow-x-visible sm:overflow-y-auto"
        >
          {sections.map((s, i) => {
            const selected = s.id === activeId;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`settings-tab-${s.id}`}
                aria-selected={selected}
                aria-current={selected ? 'page' : undefined}
                aria-controls={`settings-panel-${s.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveSection(s.id)}
                onKeyDown={(e) => handleTocKeyDown(e, i)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-left whitespace-nowrap transition-colors',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  selected
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>{s.icon}</span>
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Active panel — only the selected section renders, so there is nothing to
            scroll past. Each panel is its own scroll container for the rare case it
            overflows (Profile is inherently tall). */}
        <ScrollArea className="flex-1 min-h-0">
          <div
            role="tabpanel"
            id={`settings-panel-${activeId}`}
            aria-labelledby={`settings-tab-${activeId}`}
            className="px-6 py-6 max-w-4xl"
          >
            {/* ── Academic ─────────────────────────────────────────────── */}
            {activeId === 'academic' && (
              <section aria-label="Academic">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Load tolerance */}
                  <SettingCard
                    title="Credit Load Tolerance"
                    description="Controls how many credit hours the auto-planner targets per semester."
                  >
                    <Select
                      value={settings.loadTolerance}
                      onValueChange={(v) => dispatch({ type: 'SET_LOAD_TOLERANCE', value: v as LoadTolerance })}
                    >
                      <SelectTrigger id="load-tolerance" className="w-full" aria-label="Credit Load Tolerance">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light (up to 15 hrs/semester)</SelectItem>
                        <SelectItem value="normal">Normal (up to 17 hrs/semester)</SelectItem>
                        <SelectItem value="above_average">Above Average (up to 18 hrs/semester)</SelectItem>
                        <SelectItem value="heavy">Heavy (up to 19 hrs/semester)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingCard>

                  {/* Grad target */}
                  <SettingCard
                    title="Target Graduation"
                    description="The term the auto-planner aims to finish by."
                  >
                    <Select
                      value={settings.gradTarget}
                      onValueChange={(v) => dispatch({ type: 'SET_GRAD_TARGET', value: v })}
                    >
                      <SelectTrigger id="grad-target" className="w-full" aria-label="Target Graduation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          'Spring 2027', 'Fall 2027',
                          'Spring 2028', 'Fall 2028',
                          'Spring 2029', 'Fall 2029',
                          'Spring 2030',
                        ].map((term) => (
                          <SelectItem key={term} value={term}>{term}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingCard>

                  {/* Tech core */}
                  <SettingCard
                    title="Tech Core Track"
                    description="Sets the active tech-core track. Changing this syncs to the planner palette immediately."
                  >
                    <Select
                      value={settings.techCoreId}
                      onValueChange={(v) => dispatch({ type: 'SET_TECH_CORE', value: v })}
                    >
                      <SelectTrigger id="tech-core-settings" className="w-full" aria-label="Tech Core Track">
                        <SelectValue placeholder="Select track" />
                      </SelectTrigger>
                      <SelectContent>
                        {techCoreList.map((track) => (
                          <SelectItem key={track.id} value={track.id}>
                            {track.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingCard>

                  {/* Math BA toggle */}
                  <SettingCard
                    title="Math BA Double Major"
                    description="Include Math BA requirements in the planner."
                  >
                    <div className="flex items-center justify-between">
                      <Label htmlFor="math-ba-settings" className="text-sm text-muted-foreground">
                        Include Math BA
                      </Label>
                      <Switch
                        id="math-ba-settings"
                        checked={settings.mathBAToggle}
                        onCheckedChange={(checked) => dispatch({ type: 'SET_MATH_BA', value: checked })}
                      />
                    </div>
                  </SettingCard>
                </div>
              </section>
            )}

            {/* ── Scheduler Preferences (SCHEDULE_ENABLED) ──────────────── */}
            {SCHEDULE_ENABLED && activeId === 'scheduler' && (
              <section aria-label="Scheduler Preferences">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Scoring weights */}
                  <SettingCard
                    title="Scoring Weights"
                    description="Adjust how the scheduler scores and ranks candidate section combinations."
                    className="lg:row-span-2"
                  >
                    <div className="space-y-5">
                      <WeightSlider
                        label="GPA / Grade Quality"
                        value={settings.schedulerWeights.gpa}
                        onChange={(v) => dispatch({ type: 'SET_SCHEDULER_WEIGHTS', weights: { gpa: v } })}
                      />
                      <WeightSlider
                        label="Time Fit"
                        value={settings.schedulerWeights.timeFit}
                        onChange={(v) => dispatch({ type: 'SET_SCHEDULER_WEIGHTS', weights: { timeFit: v } })}
                      />
                      <WeightSlider
                        label="Building Walk Penalty"
                        value={settings.schedulerWeights.buildingPenalty}
                        onChange={(v) => dispatch({ type: 'SET_SCHEDULER_WEIGHTS', weights: { buildingPenalty: v } })}
                      />
                      <WeightSlider
                        label="Instruction Mode Match"
                        value={settings.schedulerWeights.instructionMode}
                        onChange={(v) => dispatch({ type: 'SET_SCHEDULER_WEIGHTS', weights: { instructionMode: v } })}
                      />
                      <WeightSlider
                        label="Professor Preference"
                        value={settings.schedulerWeights.professorPreference}
                        onChange={(v) => dispatch({ type: 'SET_SCHEDULER_WEIGHTS', weights: { professorPreference: v } })}
                      />
                      <WeightSlider
                        label="Day Spread (fewer back-to-back days)"
                        value={settings.schedulerWeights.daySpread}
                        onChange={(v) => dispatch({ type: 'SET_SCHEDULER_WEIGHTS', weights: { daySpread: v } })}
                      />
                    </div>
                  </SettingCard>

                  {/* Time window */}
                  <SettingCard title="Time-of-Day Preference">
                    <Select
                      value={settings.timeWindow}
                      onValueChange={(v) => dispatch({ type: 'SET_TIME_WINDOWS', value: v as TimeWindow })}
                    >
                      <SelectTrigger id="time-window" className="w-full" aria-label="Time-of-Day Preference">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_preference">No preference</SelectItem>
                        <SelectItem value="no_early">No early classes (before 9 AM)</SelectItem>
                        <SelectItem value="no_late">No late classes (after 5 PM)</SelectItem>
                        <SelectItem value="mornings_only">Mornings only (before noon)</SelectItem>
                        <SelectItem value="afternoons_only">Afternoons only (after noon)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingCard>

                  {/* Instruction mode */}
                  <SettingCard title="Preferred Instruction Mode">
                    <Select
                      value={settings.instructionMode}
                      onValueChange={(v) => dispatch({ type: 'SET_INSTRUCTION_MODE', value: v as InstructionMode })}
                    >
                      <SelectTrigger id="instruction-mode" className="w-full" aria-label="Preferred Instruction Mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="no_preference">No preference</SelectItem>
                        <SelectItem value="in_person">In-person</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingCard>
                </div>
              </section>
            )}

            {/* ── Professor Preferences (SCHEDULE_ENABLED) ──────────────── */}
            {SCHEDULE_ENABLED && activeId === 'professor' && (
              <section aria-label="Professor Preferences">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Add new preference */}
                  <SettingCard
                    title="Add a Preference"
                    description="The scheduler boosts preferred professors and demotes avoided ones."
                  >
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor="prof-name">Professor name</Label>
                        <input
                          id="prof-name"
                          type="text"
                          placeholder="e.g. Chirag Dekate"
                          value={newProfName}
                          onChange={(e) => setNewProfName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddProfPref()}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                      <div className="w-28 space-y-1.5">
                        <Label htmlFor="prof-type">Type</Label>
                        <Select
                          value={newProfType}
                          onValueChange={(v) => setNewProfType(v as 'prefer' | 'avoid')}
                        >
                          <SelectTrigger id="prof-type" aria-label="Preference type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="prefer">Prefer</SelectItem>
                            <SelectItem value="avoid">Avoid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 mb-0.5"
                        onClick={handleAddProfPref}
                        disabled={!newProfName.trim()}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                  </SettingCard>

                  {/* Existing prefs */}
                  <SettingCard title="Current Preferences">
                    {settings.profPreferences.length > 0 ? (
                      <div className="space-y-2">
                        {settings.profPreferences.map((pref) => (
                          <div
                            key={pref.name}
                            className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 border border-border"
                          >
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="secondary"
                                className={
                                  pref.type === 'prefer'
                                    ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300'
                                    : 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300'
                                }
                              >
                                {pref.type === 'prefer' ? 'Prefer' : 'Avoid'}
                              </Badge>
                              <span className="text-sm">{pref.name}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => dispatch({ type: 'REMOVE_PROF_PREFERENCE', name: pref.name })}
                              aria-label={`Remove ${pref.name}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No professor preferences added yet.</p>
                    )}
                  </SettingCard>
                </div>
              </section>
            )}

            {/* ── Chat Tools (AI_ENABLED) ───────────────────────────────── */}
            {/* AI hidden for soft launch — re-enable by setting AI_ENABLED=true in lib/features.ts.
                When re-enabled, this section exposes: Chat Provider, Access code (beta),
                and per-tool enable/disable toggles. The Access code field gates /api/* calls;
                the Chat Tools toggles control which tools the agent can use per turn. */}
            {AI_ENABLED && activeId === 'chat' && (
              <section aria-label="Chat Tools">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Provider selector */}
                  <SettingCard
                    title="Chat Provider"
                    description="Claude routes through the Express server and requires ANTHROPIC_API_KEY to be set server-side. Ollama runs locally with no API key."
                  >
                    <Select
                      value={settings.chatProvider}
                      onValueChange={(v) => dispatch({ type: 'SET_CHAT_PROVIDER', value: v as ChatProvider })}
                    >
                      <SelectTrigger id="chat-provider" className="w-full" aria-label="Chat Provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ollama">Ollama (local)</SelectItem>
                        <SelectItem value="claude">Claude (via server)</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingCard>

                  {/* Beta access code */}
                  <SettingCard
                    title="Access code (beta)"
                    description="Sent as x-access-code on AI requests. Leave empty for local dev (server ignores it when BETA_ACCESS_SECRET is unset)."
                  >
                    <input
                      id="access-code"
                      type="password"
                      placeholder="Leave empty for local dev"
                      value={settings.accessCode}
                      onChange={(e) => dispatch({ type: 'SET_ACCESS_CODE', value: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </SettingCard>

                  {/* Tool toggles */}
                  <SettingCard
                    title="Enabled Tools"
                    description="Choose which tools the chat advisor can use. Enabled tools are sent to the model on every turn."
                    className="lg:col-span-2"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                      {TOOL_REGISTRY.map((tool) => {
                        const enabled = settings.enabledTools.includes(tool.name);
                        return (
                          <div key={tool.name} className="flex items-start gap-3 py-1.5">
                            <Checkbox
                              id={`tool-${tool.name}`}
                              checked={enabled}
                              onCheckedChange={() => dispatch({ type: 'TOGGLE_TOOL', toolName: tool.name })}
                              aria-label={tool.name}
                            />
                            <div className="flex-1 min-w-0">
                              <label
                                htmlFor={`tool-${tool.name}`}
                                className="font-mono text-xs font-medium text-foreground cursor-pointer"
                              >
                                {tool.name}
                              </label>
                              <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SettingCard>
                </div>
              </section>
            )}

            {/* ── Profile ──────────────────────────────────────────────── */}
            {/* Inherently tall; its panel scrolls internally via the wrapping ScrollArea. */}
            {activeId === 'profile' && (
              <section aria-label="Profile">
                <ProfileEditor />
              </section>
            )}

            {/* ── Import & Personalize ─────────────────────────────────── */}
            {activeId === 'import' && (
              <section aria-label="Import & Personalize">
                <SettingCard
                  title="Import & Personalize"
                  description="Re-run the setup wizard to import a transcript or adjust your plan preferences."
                  className="max-w-md"
                >
                  <Button variant="outline" onClick={() => setWizardOpen(true)} className="gap-1.5">
                    <Upload className="h-3.5 w-3.5" />
                    Open Setup
                  </Button>
                </SettingCard>
              </section>
            )}
          </div>
        </ScrollArea>
      </div>

      <ConfirmDialog
        open={resetSettingsOpen}
        onOpenChange={setResetSettingsOpen}
        title="Reset settings to defaults"
        consequence="Restores the default credit load, graduation target, tech core track, and Math BA toggle."
        confirmLabel="Reset Settings"
        onConfirm={() => dispatch({ type: 'RESET_SETTINGS' })}
      />

      {/* Re-import from Settings intentionally has NO onImportComplete — this is
          housekeeping (updating an existing profile), not first-activation, so the
          upload reward banner is not shown. */}
      {wizardOpen && (
        <OnboardingWizard
          onComplete={() => setWizardOpen(false)}
          onDismiss={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}
