import React, { useState, useRef, useEffect } from 'react';
import { User, Bot, Loader2, Check, X, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlan, useTechCoreId, useSemesters, usePlanDispatch, useMathBAToggle } from '@/context/PlanContext';
import {
  useUserProfile,
  useCatalogRecord,
  usePrereqGraph,
  useGradeDistributions,
  useDegreeRequirements,
  useTechCoresRecord,
  useOfferingSchedule,
  useFallSectionsRaw,
} from '@/context/DataContext';
import ReactMarkdown from 'react-markdown';
import { getCourseTitle } from '@/lib/course-utils';
import type { ChatCourseRef, ChatPlanContext } from '@/types';
import type { ProposedPlanEdit, PlanEditOperation } from '@/lib/agent-tools/types';
import { runAgentTurn, createOllamaProvider } from '@/lib/agent-loop';
import type { AgentMessage } from '@/lib/agent-loop';
import { TOOL_REGISTRY, DEFAULT_ENABLED_TOOLS } from '@/lib/agent-tools/registry';
import { useSettings } from '@/context/SettingsContext';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum operations a single tool turn may propose. */
export const MAX_OPS_PER_TURN = 20;

/** Number of UI messages kept in the history window sent to the agent. */
const HISTORY_WINDOW = 20;

/** Recognised op types — must match PlanEditOperation['op'] */
const VALID_OPS = new Set<string>(['add', 'remove', 'move']);

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationError {
  reason: string;
}

/**
 * Validate a single PlanEditOperation before dispatching to PlanContext.
 * Returns null if valid, or a ValidationError describing the problem.
 */
export function validateOp(
  op: PlanEditOperation,
  catalog: Record<string, unknown> | null,
  semesterIds: string[],
  plan: Record<string, string[]>
): ValidationError | null {
  if (!VALID_OPS.has(op.op)) {
    return { reason: `Unknown operation type "${op.op}".` };
  }

  if (!catalog || !(op.courseId in catalog)) {
    return { reason: `Course "${op.courseId}" is not in the catalog.` };
  }

  if (op.op === 'add') {
    if (!semesterIds.includes(op.semesterId)) {
      return { reason: `Semester "${op.semesterId}" does not exist in your plan.` };
    }
    // Duplicate check: course already placed in any semester
    const placedIn = semesterIds.find(sid => (plan[sid] ?? []).includes(op.courseId));
    if (placedIn) {
      return { reason: `"${op.courseId}" is already placed in ${placedIn}.` };
    }
  } else if (op.op === 'remove') {
    if (!semesterIds.includes(op.semesterId)) {
      return { reason: `Semester "${op.semesterId}" does not exist in your plan.` };
    }
  } else if (op.op === 'move') {
    if (!semesterIds.includes(op.fromSemesterId)) {
      return { reason: `Source semester "${op.fromSemesterId}" does not exist in your plan.` };
    }
    if (!semesterIds.includes(op.toSemesterId)) {
      return { reason: `Destination semester "${op.toSemesterId}" does not exist in your plan.` };
    }
    // Duplicate check: another placement of same course in toSemesterId (different from fromSemesterId)
    const alreadyInDest = (plan[op.toSemesterId] ?? []).includes(op.courseId);
    if (alreadyInDest) {
      return { reason: `"${op.courseId}" is already in ${op.toSemesterId}.` };
    }
  }

  return null;
}

/**
 * Validate an entire proposal's op-count before rendering.
 * Returns null if valid, or an error string.
 */
export function validateOpCount(ops: PlanEditOperation[]): string | null {
  if (ops.length > MAX_OPS_PER_TURN) {
    return `Proposal has ${ops.length} operations (max ${MAX_OPS_PER_TURN}). Please ask for a smaller change.`;
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseThought(raw: string) {
  let thought = '';
  let answer = raw;

  const thoughtMatch = raw.match(/<thought>([\s\S]*?)<\/thought>/);
  if (thoughtMatch) {
    thought = thoughtMatch[1].trim();
    answer = raw.replace(/<thought>[\s\S]*?<\/thought>/, '').replace(/<\/?answer>/g, '').trim();
  } else {
    const partialThoughtMatch = raw.match(/<thought>([\s\S]*)/);
    if (partialThoughtMatch && !raw.includes('</thought>')) {
      thought = partialThoughtMatch[1].trim();
      answer = '';
    } else {
      answer = raw.replace(/<\/?answer>/g, '').trim();
    }
  }
  return { thought, answer };
}

/**
 * Extract a ProposedPlanEdit from a raw tool result object.
 * The propose_plan_edit tool returns { type: 'plan_edit_proposal', proposal: {...} }.
 */
function extractProposalFromToolResult(toolResult: unknown): ProposedPlanEdit | null {
  if (
    toolResult !== null &&
    typeof toolResult === 'object' &&
    (toolResult as Record<string, unknown>).type === 'plan_edit_proposal' &&
    (toolResult as Record<string, unknown>).proposal
  ) {
    return (toolResult as Record<string, unknown>).proposal as ProposedPlanEdit;
  }
  return null;
}

function operationLabel(op: PlanEditOperation): string {
  if (op.op === 'add') return `Add ${op.courseId} → ${op.semesterId}`;
  if (op.op === 'remove') return `Remove ${op.courseId} from ${op.semesterId}`;
  if (op.op === 'move') return `Move ${op.courseId}: ${op.fromSemesterId} → ${op.toSemesterId}`;
  return 'Unknown operation';
}

// ─── Message shape ────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Present when this assistant message contains a plan proposal */
  proposal?: ProposedPlanEdit;
  /** Which proposal operations have been acted on (by index) */
  actedOps?: Set<number>;
  /** Per-op validation errors, keyed by op index */
  opErrors?: Record<number, string>;
}

// ─── ProposalCard ─────────────────────────────────────────────────────────────

interface ProposalCardProps {
  proposal: ProposedPlanEdit;
  actedOps: Set<number>;
  opErrors: Record<number, string>;
  onAccept: (idx: number, op: PlanEditOperation) => void;
  onReject: (idx: number) => void;
  onPin: (idx: number, op: PlanEditOperation) => void;
}

function ProposalCard({ proposal, actedOps, opErrors, onAccept, onReject, onPin }: ProposalCardProps) {
  return (
    <div className="mt-2 border border-border rounded-lg overflow-hidden bg-background text-sm">
      <div className="px-3 py-2 bg-muted/60 border-b border-border font-semibold text-xs text-muted-foreground uppercase tracking-wide">
        Proposed Plan Changes
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
        {proposal.reasoning}
      </div>
      <ul className="divide-y divide-border">
        {proposal.operations.map((op, idx) => {
          const acted = actedOps.has(idx);
          const err = opErrors[idx];
          return (
            <li key={idx} className={`flex flex-col px-3 py-2 ${acted ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2">
                <span className="flex-1 font-mono text-xs">{operationLabel(op)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                  disabled={acted}
                  onClick={() => onAccept(idx, op)}
                  title="Accept"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                  disabled={acted || op.op !== 'add'}
                  onClick={() => onPin(idx, op)}
                  title="Accept and Pin"
                >
                  <Pin className="w-3 h-3 mr-1" />
                  Pin
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  disabled={acted}
                  onClick={() => onReject(idx)}
                  title="Reject"
                >
                  <X className="w-3 h-3 mr-1" />
                  Reject
                </Button>
              </div>
              {err && (
                <p className="mt-1 text-xs text-red-500">{err}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentHistory, setAgentHistory] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const plan = usePlan();
  const semesters = useSemesters();
  const profile = useUserProfile();
  const catalog = useCatalogRecord();
  const techCoreId = useTechCoreId();
  const mathBAToggle = useMathBAToggle();
  const dispatch = usePlanDispatch();

  // Data for ToolContext
  const prereqGraph = usePrereqGraph();
  const gradeDistributions = useGradeDistributions();
  const degreeRequirements = useDegreeRequirements();
  const techCores = useTechCoresRecord();
  const offeringSchedule = useOfferingSchedule();
  const fallSections = useFallSectionsRaw();

  // Resolve enabled tools from persisted settings; fall back to defaults when empty
  const settings = useSettings();
  const resolvedTools = settings.enabledTools.length > 0
    ? settings.enabledTools
        .map(name => TOOL_REGISTRY.find(t => t.name === name))
        .filter((t): t is typeof TOOL_REGISTRY[number] => t !== undefined)
    : DEFAULT_ENABLED_TOOLS;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getChatPlanContext = (): ChatPlanContext => {
    const profileTitles: Record<string, string> = {};
    for (const c of profile?.completed_courses ?? []) profileTitles[c.course] = c.title;
    for (const c of profile?.in_progress_courses ?? []) profileTitles[c.course] = c.title;

    const toRef = (id: string): ChatCourseRef => ({
      course: id,
      title: profileTitles[id] ?? getCourseTitle(id, catalog, {}),
    });

    const completedCourses: ChatCourseRef[] = [];
    const inProgress: ChatCourseRef[] = [];
    let totalCoursesPlanned = 0;

    semesters.forEach(sem => {
      const courses = plan[sem.id] || [];
      totalCoursesPlanned += courses.length;
      if (sem.status === 'past') {
        completedCourses.push(...courses.map(toRef));
      } else if (sem.status === 'current') {
        inProgress.push(...courses.map(toRef));
      }
    });

    return {
      techCore: techCoreId,
      completedCourses,
      inProgress,
      targetGraduation: profile?.graduation_target || 'Unknown',
      totalCoursesPlanned,
      semesterCount: semesters.length,
    };
  };

  const semesterIds = semesters.map(s => s.id);

  const handleAccept = (msgIdx: number, opIdx: number, op: PlanEditOperation) => {
    const err = validateOp(op, catalog, semesterIds, plan);
    if (err) {
      setOpError(msgIdx, opIdx, err.reason);
      return;
    }

    if (op.op === 'add') {
      dispatch({ type: 'ADD_COURSE', semesterId: op.semesterId, courseId: op.courseId });
    } else if (op.op === 'remove') {
      dispatch({ type: 'REMOVE_COURSE', semesterId: op.semesterId, courseId: op.courseId });
    } else if (op.op === 'move') {
      dispatch({ type: 'MOVE_COURSE', fromSemesterId: op.fromSemesterId, toSemesterId: op.toSemesterId, courseId: op.courseId });
    }
    markActed(msgIdx, opIdx);
  };

  const handlePin = (msgIdx: number, opIdx: number, op: PlanEditOperation) => {
    if (op.op !== 'add') return;

    const err = validateOp(op, catalog, semesterIds, plan);
    if (err) {
      setOpError(msgIdx, opIdx, err.reason);
      return;
    }

    dispatch({ type: 'ADD_COURSE', semesterId: op.semesterId, courseId: op.courseId });
    dispatch({ type: 'PIN_COURSE', courseId: op.courseId });
    markActed(msgIdx, opIdx);
  };

  const handleReject = (msgIdx: number, opIdx: number) => {
    markActed(msgIdx, opIdx);
  };

  const markActed = (msgIdx: number, opIdx: number) => {
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIdx) return m;
      const newActed = new Set(m.actedOps ?? []);
      newActed.add(opIdx);
      return { ...m, actedOps: newActed };
    }));
  };

  const setOpError = (msgIdx: number, opIdx: number, reason: string) => {
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIdx) return m;
      return { ...m, opErrors: { ...(m.opErrors ?? {}), [opIdx]: reason } };
    }));
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    const userMsg: Message = { role: 'user', content: userText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Placeholder assistant message so the user sees "thinking" state
    const placeholderMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, placeholderMsg]);

    try {
      const planContext = getChatPlanContext();

      const systemPrompt = [
        'You are an academic advisor helping an ECE student at UT Austin plan their degree.',
        `Tech core: ${planContext.techCore}.`,
        `Target graduation: ${planContext.targetGraduation}.`,
        `Semesters planned: ${planContext.semesterCount}, total courses: ${planContext.totalCoursesPlanned}.`,
        `Completed courses: ${planContext.completedCourses.map(c => c.course).join(', ') || 'none'}.`,
        `In-progress courses: ${planContext.inProgress.map(c => c.course).join(', ') || 'none'}.`,
        'When proposing changes to the plan, use the propose_plan_edit tool.',
        'Provide concise, actionable academic advice.',
      ].join(' ');

      const provider = createOllamaProvider();

      // Keep agent history in sync with the 20-message window
      const historyWindow = agentHistory.slice(-(HISTORY_WINDOW - 1));

      const result = await runAgentTurn(historyWindow, userText, {
        provider,
        tools: resolvedTools,
        toolContext: {
          catalog: catalog ?? {},
          prereqGraph,
          gradeDistributions,
          userProfile: profile ?? {
            name: '', eid: '', university: '', catalog_year: '', major: 'ECE',
            classification: 'Sophomore', first_semester: '', graduation_target: '',
            tech_core: { declared: techCoreId, status: 'declared', required_math: '', required_ece: [], tech_electives_needed: 0 },
            secondary_aspirations: {
              math_ba: { status: 'not_pursuing', notes: '' },
              advanced_math_cert: { status: 'not_pursuing', notes: '' },
              jefferson_scholars_cert: { status: 'not_pursuing', notes: '' },
            },
            preferences: { course_load: 'moderate', course_load_tolerance: 'moderate', time_preference: 'morning', summer_courses: false, summer_notes: '' },
            gpa: { cumulative: 0, lower_division: 0, upper_division: 0, gpa_hours: 0, grade_points: 0 },
            credit_summary: { total_hours_transferred: 0, total_hours_taken: 0, total_hours: 0 },
            completed_courses: [],
            in_progress_courses: [],
            career_interests: [],
            notes: '',
          },
          degreeRequirements: degreeRequirements ?? {
            ece_core: { courses: [], notes: '', honors_variants: {}, senior_design_options: [] },
            core_curriculum: { slots: [] },
            tech_core: { description: '', components: { advanced_math: { hours: '3', count: 1 }, core_courses: { hours: '3', count: 3 }, core_lab: { hours: '1', count: 1 }, tech_electives: { hours_min: 3, count: '3' } }, notes: '' },
            advanced_tech_elective: { count: 1, hours: '3', description: '' },
            free_electives: { total_hours: 6, constraints: [], approved_list_url: '' },
            math_sequence: { required: [], alternate_calculus: [], notes: '' },
            physics_sequence: { required: [], alternate: [], notes: '' },
            total_credit_hours: 128,
            notes: '',
          },
          techCores: techCores ?? {},
          offeringSchedule,
          fallSections,
          plan,
          semesters,
          techCoreId,
          mathBAToggle,
        },
        systemPrompt,
      });

      // Extract proposal if the tool was propose_plan_edit
      let proposal: ProposedPlanEdit | undefined;
      let opCountError: string | undefined;

      if (result.toolCallMade?.name === 'propose_plan_edit' && result.toolResult) {
        const extracted = extractProposalFromToolResult(result.toolResult);
        if (extracted) {
          const countErr = validateOpCount(extracted.operations);
          if (countErr) {
            opCountError = countErr;
          } else {
            proposal = extracted;
          }
        }
      }

      const assistantContent = opCountError
        ? `I tried to propose ${(result.toolResult as Record<string, unknown> | null)?.proposal ? 'changes' : 'something'} but it was too large. ${opCountError}`
        : result.finalText;

      // Update placeholder with real response
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: assistantContent,
          proposal: proposal ?? undefined,
          actedOps: new Set(),
          opErrors: {},
        };
        return updated;
      });

      // Append to agent history (user + assistant)
      const newAgentHistory: AgentMessage[] = [
        ...historyWindow,
        { role: 'user', content: userText },
        { role: 'assistant', content: assistantContent },
      ];
      setAgentHistory(newAgentHistory.slice(-HISTORY_WINDOW));

    } catch (error: unknown) {
      const msg = error instanceof Error
        ? error.message
        : 'Sorry, something went wrong communicating with the chat backend.';
      console.error('Chat Error:', error);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: msg };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-2 opacity-20" />
            <p className="text-sm text-muted-foreground">
              Ask Adi's advisor about degree requirements, prerequisites, or course difficulty.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const { thought, answer } = m.role === 'assistant' ? parseThought(m.content) : { thought: '', answer: m.content };
          const isProposal = m.role === 'assistant' && !!m.proposal;
          return (
            <div
              key={i}
              className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {m.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                {m.role === 'assistant' && thought && (
                  <details className="mb-2 border border-border rounded bg-background/50">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground p-2 select-none hover:bg-background/80 rounded transition-colors">
                      AI is thinking...
                    </summary>
                    <div className="p-3 text-xs font-mono text-muted-foreground border-t border-border whitespace-pre-wrap">
                      {thought}
                    </div>
                  </details>
                )}
                {isProposal ? (
                  <ProposalCard
                    proposal={m.proposal!}
                    actedOps={m.actedOps ?? new Set()}
                    opErrors={m.opErrors ?? {}}
                    onAccept={(opIdx, op) => handleAccept(i, opIdx, op)}
                    onReject={(opIdx) => handleReject(i, opIdx)}
                    onPin={(opIdx, op) => handlePin(i, opIdx, op)}
                  />
                ) : answer ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>
                      {answer}
                    </ReactMarkdown>
                  </div>
                ) : (
                  m.role === 'assistant' && <span className="text-muted-foreground text-xs animate-pulse">Thinking...</span>
                )}
              </div>
            </div>
          );
        })}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
            <div className="max-w-[85%] px-3 py-2 rounded-lg bg-muted text-sm italic text-muted-foreground">
              Consulting advisor...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-background">
        <form
          className="relative flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <input
            autoFocus
            type="text"
            placeholder="Ask about your plan..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className={[
              'flex-1 pl-3 pr-10 py-2 text-sm',
              'bg-muted border border-input rounded-md',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-1 focus:ring-ring',
              'disabled:opacity-50',
            ].join(' ')}
          />
          <Button
            type="submit"
            disabled={!input.trim() || isLoading}
            size="sm"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
          </Button>
        </form>
      </div>
    </div>
  );
}
