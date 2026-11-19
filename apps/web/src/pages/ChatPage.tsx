import { useState, useRef, useEffect } from 'react';
import { Send, X, Copy, Check, MessageSquare, Sparkles, Loader2 } from 'lucide-react';
import { useChat } from '../hooks/useItems';
import { useSettings } from '../hooks/useSettings';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { ScrollArea } from '../components/ui/ScrollArea';
import { cn } from '../utils/cn';
import { useSuccessToast, useErrorToast } from '../components/ui/Toast';

export function ChatPage() {
  const { settings } = useSettings();
  const { mutate: chat, isPending, data: chatData } = useChat();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();

  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; citations?: any[]; timestamp: Date }>>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSubmit = async (e?: { preventDefault?: () => void }, suggestedMessage?: string) => {
    e?.preventDefault?.();
    const message = (suggestedMessage || input).trim();
    if (!message || isPending) return;

    const userMessage = message;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setIsTyping(true);

    try {
      const result = await new Promise<any>((resolve, reject) => {
        chat(
          { message: userMessage, contextLimit: 15 },
          {
            onSuccess: resolve,
            onError: reject,
          }
        );
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.answer,
        citations: result.citations,
        timestamp: new Date(),
      }]);
    } catch (error) {
      errorToast('Chat failed', error instanceof Error ? error.message : 'Unknown error');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    successToast('Copied to clipboard');
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput('');
  };

  // Example prompts
  const examplePrompts = [
    "What did I save about React hooks?",
    "Show me all recipe saves",
    "What design inspiration did I save last month?",
    "Find saves about productivity",
    "What did I save from @username?",
  ];

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MessageSquare className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Chat with your saves</h1>
            <p className="text-sm text-muted-foreground">Ask anything about what you've saved</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleNewChat}>
            <Sparkles className="h-4 w-4 mr-1" /> New Chat
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="p-4 rounded-full bg-primary/10 mb-6">
              <Sparkles className="h-12 w-12 text-primary mx-auto" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Start a conversation</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
              Ask me anything about your saved content. I'll search through your saves and give you answers with citations.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {examplePrompts.map((prompt, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-left min-w-[200px]"
                  onClick={() => { void handleSubmit(undefined, prompt); }}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <MessageBubble key={index} message={message} onCopy={handleCopy} />
          ))
        )}

        {isTyping && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-4 bg-card/50 backdrop-blur">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your saves..."
            className="flex-1 min-h-[48px] max-h-48 px-4 py-3 rounded-xl border bg-background resize-none focus:ring-2 focus:ring-primary/20"
            rows={1}
            disabled={isPending}
            aria-label="Chat input"
          />
          <Button
            type="submit"
            size="lg"
            disabled={!input.trim() || isPending}
            className="h-12 self-end"
            aria-label="Send message"
          >
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Powered by your saved content • AI answers based on your library
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message, onCopy }: { message: any; onCopy: (text: string) => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className={cn('flex gap-3', message.role === 'user' && 'flex-row-reverse')}>
      <Avatar
        fallback={message.role === 'user' ? 'You' : 'AI'}
        src={message.role === 'assistant' ? undefined : undefined}
        className="shrink-0"
      />
      <div className={cn('flex-1 max-w-3xl', message.role === 'user' && 'text-right')}>
        <div className={cn(
          'inline-block px-4 py-2.5 rounded-2xl text-sm',
          message.role === 'user'
            ? 'bg-primary text-primary-foreground rounded-tr-none'
            : 'bg-muted rounded-tl-none'
        )}>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap">{message.content}</div>

          {/* Citations */}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.citations.slice(0, 3).map((citation: any, i: number) => (
                <a
                  key={i}
                  href={citation.itemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs bg-background/50 rounded hover:bg-accent transition-colors"
                >
                  <span className="text-muted-foreground">[{i + 1}]</span>
                  <span className="truncate max-w-[200px]">{citation.itemTitle}</span>
                </a>
              ))}
              {message.citations.length > 3 && (
                <span className="text-xs text-muted-foreground">+{message.citations.length - 3} more</span>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-2">
            <span className="text-xs text-muted-foreground">{message.timestamp.toLocaleTimeString()}</span>
            <Button variant="ghost" size="icon" onClick={() => { onCopy(message.content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <Avatar fallback="AI" />
      <div className="bg-muted rounded-2xl rounded-tl-none px-4 py-3">
        <div className="flex gap-1">
          <span className="h-2 w-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="h-2 w-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
