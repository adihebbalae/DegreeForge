import React, { useState, useRef, useEffect } from 'react';
import { User, Bot, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlan, useTechCoreId, useSemesters } from '@/context/PlanContext';
import { useUserProfile } from '@/context/DataContext';
import ReactMarkdown from 'react-markdown';
import type { ChatPlanContext } from '@/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const plan = usePlan();
  const semesters = useSemesters();
  const profile = useUserProfile();
  const techCoreId = useTechCoreId();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getChatPlanContext = (): ChatPlanContext => {
    const completedCourses: string[] = [];
    const inProgress: string[] = [];
    let totalCoursesPlanned = 0;

    semesters.forEach(sem => {
      const courses = plan[sem.id] || [];
      totalCoursesPlanned += courses.length;
      if (sem.status === 'past') {
        completedCourses.push(...courses);
      } else if (sem.status === 'current') {
        inProgress.push(...courses);
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
          messages: newMessages.slice(-20), // Session history limit
          planContext: getChatPlanContext(),
        }),
      });

      if (!response.ok) throw new Error('Chat API failed. Check your API key.');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

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
              assistantMsg.content += text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { ...assistantMsg };
                return updated;
              });
            } catch (e) {
              // Ignore parse errors from partial chunks
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Chat Error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: error.message || 'Sorry, something went wrong. Check your API key.' },
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
        {messages.map((m, i) => (
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
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
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
