'use client';

// Conversational assistant over the org's occurrence data.
//
// The transcript is stored server-side per user, so a conversation survives a
// refresh and follow-up questions ("which site was that?") still resolve. The
// assistant's replies are written by the edge function rather than posted from
// here, so what's on screen is what the model actually said.

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, SendHorizonal, Sparkles, Trash2, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';

interface Msg { id?: number; role: 'user' | 'assistant'; content: string; created_at?: string }

const SUGGESTIONS = [
  'What should I be worried about this week?',
  'Which site is generating the most occurrences, and why?',
  'Are we missing SLAs anywhere, and on what type?',
  'Is any one person carrying too much of the workload?',
];

export function AssistantChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.functions.invoke('ai-assistant', { body: { mode: 'history' } });
      const d = data as { messages?: Msg[] } | null;
      setMessages(d?.messages ?? []);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setError(null);
    setInput('');
    // Show the question immediately; the reply lands when the model returns.
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setBusy(true);

    const supabase = createClient();
    const { data, error: err } = await supabase.functions.invoke('ai-assistant', {
      body: { mode: 'chat', message },
    });
    setBusy(false);

    const d = data as { ok?: boolean; reply?: string; error?: string } | null;
    if (err || !d?.ok || !d.reply) {
      setError(d?.error ?? err?.message ?? 'The assistant could not answer that.');
      // Roll the unanswered question back off the transcript — the server
      // never stored it, so leaving it would misrepresent the history.
      setMessages((m) => m.slice(0, -1));
      return;
    }
    setMessages((m) => [...m, { role: 'assistant', content: d.reply as string }]);
  }

  async function clearAll() {
    const supabase = createClient();
    await supabase.functions.invoke('ai-assistant', { body: { mode: 'clear' } });
    setMessages([]);
    setError(null);
  }

  return (
    <Card className="flex h-[calc(100vh-13rem)] min-h-[30rem] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-brand-gradient px-5 py-3">
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">Operations assistant</span>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-white/85 transition hover:bg-white/15 hover:text-white"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      <CardContent className="flex-1 space-y-4 overflow-y-auto py-5">
        {!loaded && (
          <p className="flex items-center gap-2 text-sm text-[hsl(var(--muted))]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your conversation…
          </p>
        )}

        {loaded && messages.length === 0 && (
          <div>
            <p className="text-sm text-[hsl(var(--muted))]">
              Ask about your occurrences, sites, SLAs or workload. The assistant reads your
              live data — it is not answering from general knowledge.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-xl border border-[hsl(var(--border))] px-3 py-2.5 text-left text-sm transition hover:border-[hsl(var(--brand))] hover:bg-[hsl(var(--brand))]/5"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={m.id ?? i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'assistant' && (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            )}
            <div
              className={`max-w-[46rem] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-brand-gradient text-white'
                  : 'bg-[hsl(var(--surface))] border border-[hsl(var(--border))]'
              }`}
            >
              {m.content.split(/\n{2,}/).map((para, j) => (
                <p key={j} className={j > 0 ? 'mt-2.5' : ''}>{para.trim()}</p>
              ))}
            </div>
            {m.role === 'user' && (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--border))]">
                <User className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-3 text-sm text-[hsl(var(--muted))]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading your data…</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div ref={endRef} />
      </CardContent>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your occurrences…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); }
            }}
          />
          <Button onClick={() => send(input)} disabled={busy || !input.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-[hsl(var(--muted))]">
          Enter to send, Shift+Enter for a new line. Answers are AI-generated from your live data — verify before acting.
        </p>
      </div>
    </Card>
  );
}
