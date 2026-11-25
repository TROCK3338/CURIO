import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Copy, RotateCcw, Sparkles } from 'lucide-react';
import type { ChatCitation } from '@curio/shared';
import { useChat } from '../hooks/useItems';
import { useSuccessToast } from '../components/ui/Toast';
import { decodeEntities } from '../utils/text';
import { cn } from '../utils/cn';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  error?: boolean;
}

const SUGGESTIONS = [
  'What recipes have I saved?',
  'Summarize my design inspiration',
  'Any places I wanted to visit?',
  'What did I save this week about AI?',
];

/** Renders "[2]" markers in an answer as small tappable badges linking to the save. */
function AnswerText({ text, citations }: { text: string; citations?: ChatCitation[] }) {
  const byMarker = new Map((citations ?? []).map(c => [c.marker, c]));
  const parts = text.split(/(\[\d+(?:\s*,\s*\d+)*\])/g);
  return (
    <p className="whitespace-pre-wrap text-[15.5px] leading-relaxed">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
        if (!match) return <span key={i}>{part}</span>;
        return match[1].split(',').map(n => Number(n.trim())).map(n => {
          const c = byMarker.get(n);
          return c ? (
            <Link key={`${i}-${n}`} to={`/item/${c.itemId}`} className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/20 px-1 align-text-top text-[11px] font-bold text-primary">
              {n}
            </Link>
          ) : null;
        });
      })}
    </p>
  );
}

export function ChatPage() {
  const chat = useChat();
  const successToast = useSuccessToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, chat.isPending]);

  // Auto-grow the textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const send = (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || chat.isPending) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    chat.mutate(
      { message, contextLimit: 12 },
      {
        onSuccess: result => setMessages(prev => [...prev, { role: 'assistant', content: result.answer, citations: result.citations }]),
        onError: error =>
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: error instanceof Error ? `Couldn’t answer: ${error.message}` : 'Something went wrong. Try again.',
            error: true,
          }]),
      },
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] flex-col lg:min-h-[100dvh]">
      <div className="flex-1 space-y-5 px-4 pb-44 pt-3 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-10 lg:pb-36 lg:pt-10">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-10 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary/20 text-primary">
              <Sparkles className="h-8 w-8" />
            </span>
            <h1 className="mt-5 font-display text-4xl italic">Ask your library</h1>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Answers come only from what you&rsquo;ve saved, with links back to each source.
            </p>
            <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" onClick={() => send(s)} className="pressable rounded-2xl border bg-card px-4 py-3 text-left text-[15px] hover:border-primary/50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <button type="button" onClick={() => setMessages([])} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <RotateCcw className="h-3.5 w-3.5" /> New chat
              </button>
            </div>
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-primary px-4 py-2.5 text-[15.5px] text-primary-foreground">{m.content}</p>
                </div>
              ) : (
                <div key={i} className="space-y-3">
                  <div className={cn('rounded-[22px] rounded-bl-md border bg-card px-4 py-3', m.error && 'border-destructive/40')}>
                    <AnswerText text={m.content} citations={m.citations} />
                  </div>
                  {m.citations && m.citations.length > 0 && (
                    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                      {m.citations.map(c => (
                        <Link key={c.itemId} to={`/item/${c.itemId}`} className="pressable w-[210px] shrink-0 rounded-2xl border bg-card p-3">
                          <span className="flex items-center gap-2">
                            <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/20 px-1 text-[11px] font-bold text-primary">{c.marker}</span>
                            <span className="truncate text-sm font-semibold">{decodeEntities(c.itemTitle)}</span>
                          </span>
                          {c.excerpt && <span className="mt-1 block text-xs text-muted-foreground line-clamp-2">{decodeEntities(c.excerpt)}</span>}
                        </Link>
                      ))}
                    </div>
                  )}
                  {!m.error && (
                    <button
                      type="button"
                      onClick={async () => { await navigator.clipboard?.writeText(m.content); successToast('Copied'); }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </button>
                  )}
                </div>
              ),
            )}
            {chat.isPending && (
              <div className="flex w-16 items-center justify-center gap-1 rounded-[22px] rounded-bl-md border bg-card py-4" aria-label="Thinking">
                {[0, 1, 2].map(i => (
                  <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            )}
          </>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer, floating above the tab bar */}
      <form
        onSubmit={onSubmit}
        className="fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl px-4 lg:bottom-8 lg:left-64 lg:max-w-3xl lg:px-10"
      >
        <div className="glass flex items-end gap-2 rounded-[24px] border border-white/10 p-1.5 pl-4 shadow-lg">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about your saves…"
            className="max-h-[140px] min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[16px] placeholder:text-muted-foreground focus:outline-none"
            aria-label="Message"
          />
          <button
            type="submit"
            disabled={!input.trim() || chat.isPending}
            className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-30"
            aria-label="Send"
          >
            <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
      </form>
    </div>
  );
}
