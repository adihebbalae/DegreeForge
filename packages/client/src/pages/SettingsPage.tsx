import { useState } from 'react';
import { RotateCcw, X, Plus, User, Sliders, BookOpen, MessageSquare, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
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
import type { TechCoreTrack } from '@/types';

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
    </div>
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

// ─── SettingsPage ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const settings = useSettings();
  const dispatch = useSettingsDispatch();
  const techCoresRecord = useTechCoresRecord();

  const [newProfName, setNewProfName] = useState('');
  const [newProfType, setNewProfType] = useState<'prefer' | 'avoid'>('prefer');
  const [resetSettingsOpen, setResetSettingsOpen] = useState(false);
  const [rerunOnboardingOpen, setRerunOnboardingOpen] = useState(false);

  const techCoreList = techCoresRecord
    ? (Object.entries(techCoresRecord) as [string, TechCoreTrack][]).map(([id, track]) => ({
        id,
        name: track.name,
      }))
    : [];

  const handleReset = () => {
    setResetSettingsOpen(true);
  };

  const handleAddProfPref = () => {
    const name = newProfName.trim();
    if (!name) return;
    dispatch({ type: 'ADD_PROF_PREFERENCE', pref: { name, type: newProfType } });
    setNewProfName('');
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

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-10">

          {/* ── Section 1: Academic ─────────────────────────────────────── */}
          <section aria-labelledby="academic-section">
            <SectionHeader icon={<BookOpen className="h-4 w-4" />} title="Academic" />

            <div className="space-y-6">
              {/* Load tolerance */}
              <div className="space-y-2">
                <Label htmlFor="load-tolerance">Credit Load Tolerance</Label>
                <Select
                  value={settings.loadTolerance}
                  onValueChange={(v) => dispatch({ type: 'SET_LOAD_TOLERANCE', value: v as LoadTolerance })}
                >
                  <SelectTrigger id="load-tolerance" className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light (up to 15 hrs/semester)</SelectItem>
                    <SelectItem value="normal">Normal (up to 17 hrs/semester)</SelectItem>
                    <SelectItem value="above_average">Above Average (up to 18 hrs/semester)</SelectItem>
                    <SelectItem value="heavy">Heavy (up to 19 hrs/semester)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Controls how many credit hours the auto-planner targets per semester.
                </p>
              </div>

              {/* Grad target */}
              <div className="space-y-2">
                <Label htmlFor="grad-target">Target Graduation</Label>
                <Select
                  value={settings.gradTarget}
                  onValueChange={(v) => dispatch({ type: 'SET_GRAD_TARGET', value: v })}
                >
                  <SelectTrigger id="grad-target" className="w-64">
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
              </div>

              {/* Tech core */}
              <div className="space-y-2">
                <Label htmlFor="tech-core-settings">Tech Core Track</Label>
                <Select
                  value={settings.techCoreId}
                  onValueChange={(v) => dispatch({ type: 'SET_TECH_CORE', value: v })}
                >
                  <SelectTrigger id="tech-core-settings" className="w-full max-w-sm">
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
                <p className="text-xs text-muted-foreground">
                  Sets the active tech-core track. Changing this syncs to the planner palette immediately.
                </p>
              </div>

              {/* Math BA toggle */}
              <div className="flex items-center justify-between py-1">
                <div className="space-y-0.5">
                  <Label htmlFor="math-ba-settings">Math BA Double Major</Label>
                  <p className="text-xs text-muted-foreground">Include Math BA requirements in the planner.</p>
                </div>
                <Switch
                  id="math-ba-settings"
                  checked={settings.mathBAToggle}
                  onCheckedChange={(checked) => dispatch({ type: 'SET_MATH_BA', value: checked })}
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Section 2: Scheduler Preferences ───────────────────────── */}
          <section aria-labelledby="scheduler-section">
            <SectionHeader icon={<Sliders className="h-4 w-4" />} title="Scheduler Preferences" />

            <div className="space-y-6">
              {/* Scoring weights */}
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Adjust how the scheduler scores and ranks candidate section combinations.
                </p>
                <div className="space-y-5 p-4 bg-muted/40 rounded-lg border border-border">
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
              </div>

              {/* Time window */}
              <div className="space-y-2">
                <Label htmlFor="time-window">Time-of-Day Preference</Label>
                <Select
                  value={settings.timeWindow}
                  onValueChange={(v) => dispatch({ type: 'SET_TIME_WINDOWS', value: v as TimeWindow })}
                >
                  <SelectTrigger id="time-window" className="w-64">
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
              </div>

              {/* Instruction mode */}
              <div className="space-y-2">
                <Label htmlFor="instruction-mode">Preferred Instruction Mode</Label>
                <Select
                  value={settings.instructionMode}
                  onValueChange={(v) => dispatch({ type: 'SET_INSTRUCTION_MODE', value: v as InstructionMode })}
                >
                  <SelectTrigger id="instruction-mode" className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_preference">No preference</SelectItem>
                    <SelectItem value="in_person">In-person</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Section 3: Professor Preferences ───────────────────────── */}
          <section aria-labelledby="prof-section">
            <SectionHeader icon={<User className="h-4 w-4" />} title="Professor Preferences" />

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The scheduler boosts sections taught by preferred professors and demotes sections taught by avoided professors.
              </p>

              {/* Existing prefs */}
              {settings.profPreferences.length > 0 && (
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
              )}

              {settings.profPreferences.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No professor preferences added yet.</p>
              )}

              {/* Add new preference */}
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
                    <SelectTrigger id="prof-type">
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
            </div>
          </section>

          <Separator />

          {/* ── Section 4: Chat Tools ───────────────────────────────────── */}
          <section aria-labelledby="chat-tools-section">
            <SectionHeader icon={<MessageSquare className="h-4 w-4" />} title="Chat Tools" />

            {/* Provider selector */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="chat-provider">Chat Provider</Label>
              <Select
                value={settings.chatProvider}
                onValueChange={(v) => dispatch({ type: 'SET_CHAT_PROVIDER', value: v as ChatProvider })}
              >
                <SelectTrigger id="chat-provider" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ollama">Ollama (local)</SelectItem>
                  <SelectItem value="claude">Claude (via server)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Claude routes through the Express server and requires{' '}
                <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> to be set server-side.
                Ollama runs locally with no API key.
              </p>
            </div>

            {/* Beta access code */}
            <div className="space-y-2 mb-6">
              <Label htmlFor="access-code">Access code (beta)</Label>
              <input
                id="access-code"
                type="password"
                placeholder="Leave empty for local dev"
                value={settings.accessCode}
                onChange={(e) => dispatch({ type: 'SET_ACCESS_CODE', value: e.target.value })}
                className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Sent as <code className="font-mono text-xs">x-access-code</code> on AI requests.
                Leave empty for local dev (server ignores it when{' '}
                <code className="font-mono text-xs">BETA_ACCESS_SECRET</code> is unset).
              </p>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Choose which tools the chat advisor can use. Enabled tools are sent to the model on every turn.
            </p>

            <div className="space-y-2 p-4 bg-muted/40 rounded-lg border border-border">
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
          </section>

          <Separator />

          {/* ── Section 5: Profile ──────────────────────────────────────── */}
          <section aria-labelledby="profile-section">
            <SectionHeader icon={<UserCog className="h-4 w-4" />} title="Profile" />
            <ProfileEditor />
          </section>

          {/* Bottom padding */}
          <div className="h-8" />
          
          <Separator />

          <section aria-labelledby="onboarding-section" className="pt-4">
             <div className="flex items-center justify-between">
               <div>
                 <h2 className="text-base font-semibold text-foreground">Re-run Onboarding</h2>
                 <p className="text-sm text-muted-foreground">Restart the initial setup wizard.</p>
               </div>
               <Button
                  variant="outline"
                  onClick={() => setRerunOnboardingOpen(true)}
               >
                 Re-run Onboarding
               </Button>
             </div>
          </section>
          
          <div className="h-8" />
        </div>
      </ScrollArea>

      <ConfirmDialog
        open={resetSettingsOpen}
        onOpenChange={setResetSettingsOpen}
        title="Reset settings to defaults"
        consequence="Restores default scoring weights, time window, instruction mode, and graduation target. Professor preferences are cleared."
        confirmLabel="Reset Settings"
        onConfirm={() => dispatch({ type: 'RESET_SETTINGS' })}
      />

      <ConfirmDialog
        open={rerunOnboardingOpen}
        onOpenChange={setRerunOnboardingOpen}
        title="Re-run onboarding wizard"
        consequence={`Overwrites ${settings.profPreferences.length} saved professor preference${settings.profPreferences.length === 1 ? '' : 's'} and resets onboarding flags. Reloads the page.`}
        confirmLabel="Re-run Onboarding"
        onConfirm={() => {
          localStorage.removeItem('degreeforge:onboarded');
          window.location.reload();
        }}
      />
    </div>
  );
}
