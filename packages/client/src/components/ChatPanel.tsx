import React, { useState, useRef, useEffect } from 'react';
import { User, Bot, Loader2, Check, X, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlan, useTechCoreId, useSemesters, usePlanDispatch } from '@/context/PlanContext';
import { useUserProfile, useCatalogRecord } from '@/context/DataContext';
import ReactMarkdown from 'react-markdown';
import { getCourseTitle } from '@/lib/course-utils';
import type { ChatCourseRef, ChatPlanContext } from '@/types';
import type { ProposedPlanEdit, PlanEditOperation } from '@/lib/agent-tools/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Present when this assistant message contains a plan proposal */
  proposal?: ProposedPlanEdit;
  /** Which proposal operations have been acted on (by index) */
  actedOps?: Set<number>;
}

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
 * Attempt to extract a plan_edit_proposal from a JSON response string.
 * The agent-loop returns JSON.stringify(result.content) when a tool is called.
 */
function extractProposal(text: string): ProposedPlanEdit | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed.type === 'plan_edit_proposal' && parsed.proposal) {
      return parsed.proposal as ProposedPlanEdit;
    }
  } catch {
    // Not JSON or not a proposal — that's fine
  }
  return null;
}

function operationLabel(op: PlanEditOperation): string {
  if (op.op === 'add') return `Add ${op.courseId} → ${op.semesterId}`;
  if (op.op === 'remove') return `Remove ${op.courseId} from ${op.semesterId}`;
  if (op.op === 'move') return `Move ${op.courseId}: ${op.fromSemesterId} → ${op.toSemesterId}`;
  return 'Unknown operation';
}

interface ProposalCardProps {
  proposal: ProposedPlanEdit;
  actedOps: Set<number>;
  onAccept: (idx: number, op: PlanEditOperation) => void;
  onReject: (idx: number) => void;
  onPin: (idx: number, op: PlanEditOperation) => void;
}

function ProposalCard({ proposal, actedOps, onAccept, onReject, onPin }: ProposalCardProps) {
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
          return (
            <li key={idx} className={`flex items-center gap-2 px-3 py-2 ${acted ? 'opacity-40' : ''}`}>
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const plan = usePlan();
  const semesters = useSemesters();
  const profile = useUserProfile();
  const catalog = useCatalogRecord();
  const techCoreId = useTechCoreId();
  const dispatch = usePlanDispatch();

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

  const handleAccept = (msgIdx: number, opIdx: number, op: PlanEditOperation) => {
    // Dispatch the action to plan state
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
    if (op.op === 'add') {
      dispatch({ type: 'ADD_COURSE', semesterId: op.semesterId, courseId: op.courseId });
      dispatch({ type: 'PIN_COURSE', courseId: op.courseId });
    }
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          planContext: getChatPlanContext(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Chat API failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantContent = '';
      let assistantMsg: Message = { role: 'assistant', content: '' };
      setMessages((prev) => [...prev, assistantMsg]);

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const { text } = JSON.parse(data);
              assistantContent += text;
              const proposal = extractProposal(assistantContent);
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: assistantContent,
                  proposal: proposal ?? undefined,
                  actedOps: new Set(),
                };
                return updated;
              });
            } catch {
              // Ignore parse errors from partial chunks
            }
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Sorry, something went wrong communicating with the chat backend.';
      console.error('Chat Error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: msg },
      ]);
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
