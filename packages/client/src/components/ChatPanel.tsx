import React, { useState, useRef, useEffect } from 'react';
import { User, Bot, Loader2 } from 'lucide-react';
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
import { runAgentTurn, createOllamaProvider, createClaudeProvider } from '@/lib/agent-loop';
import type { AgentMessage } from '@/lib/agent-loop';
import { TOOL_REGISTRY, DEFAULT_ENABLED_TOOLS } from '@/lib/agent-tools/registry';
import { useSettings } from '@/context/SettingsContext';
import { validateOp, validateOpCount } from '@/lib/plan-edit-validation';
import { makeDefaultUserProfile, DEFAULT_DEGREE_REQUIREMENTS } from '@/lib/chat-defaults';
import ProposalCard from '@/components/chat/ProposalCard';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Number of UI messages kept in the history window sent to the agent. */
const HISTORY_WINDOW = 20;

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
        'Tool selection guidance:',
        'graduation / remaining requirements / what do I still need → list_remaining_requirements or get_credit_progress;',
        'what does X unlock / what comes after X / downstream courses → get_downstream;',
        'course facts / description / prerequisites → get_course_info.',
        'When the user asks a question, use whatever tools you need to fully answer it in one go.',
        'Do NOT ask the user for permission to look something up, and do NOT stop to ask "want me to check X?" when X is clearly part of answering their question.',
        'Only ask a follow-up question when the request is genuinely ambiguous.',
      ].join(' ');

      const provider = settings.chatProvider === 'claude'
        ? createClaudeProvider(undefined, settings.accessCode)
        : createOllamaProvider();

      // Keep agent history in sync with the 20-message window
      const historyWindow = agentHistory.slice(-(HISTORY_WINDOW - 1));

      const result = await runAgentTurn(historyWindow, userText, {
        provider,
        tools: resolvedTools,
        toolContext: {
          catalog: catalog ?? {},
          prereqGraph,
          gradeDistributions,
          userProfile: profile ?? makeDefaultUserProfile(techCoreId),
          degreeRequirements: degreeRequirements ?? DEFAULT_DEGREE_REQUIREMENTS,
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
