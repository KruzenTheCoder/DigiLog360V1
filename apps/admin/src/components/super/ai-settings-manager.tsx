'use client';

// Super User → AI Assistant.
//
// One switch per organisation. It gates the briefing at the EDGE FUNCTION, not
// merely in the UI — turning it off means occurrence text stops being sent to
// Groq for that org, which is the whole point of having the switch.

import { useState } from 'react';
import { AlertCircle, Check, Loader2, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { GradientSection } from '@/components/ui/gradient-section';

interface Org { id: string; name: string; ai_insights_enabled: boolean | null }

export function AiSettingsManager({ orgs: initial }: { orgs: Org[] }) {
  const [orgs, setOrgs] = useState<Org[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function toggle(org: Org) {
    const next = !(org.ai_insights_enabled ?? true);
    setBusyId(org.id);
    setMsg(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const { error } = await sb.from('organizations')
      .update({ ai_insights_enabled: next }).eq('id', org.id);
    setBusyId(null);
    if (error) { setMsg({ kind: 'error', text: error.message }); return; }
    setOrgs((os) => os.map((o) => (o.id === org.id ? { ...o, ai_insights_enabled: next } : o)));
    setMsg({
      kind: 'ok',
      text: next
        ? `AI briefing switched on for ${org.name}.`
        : `AI briefing switched off for ${org.name} — no occurrence data will be sent to the model.`,
    });
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
          msg.kind === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
            : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
        }`}>
          {msg.kind === 'ok' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <GradientSection title="AI briefing by organisation" icon="Sparkles" tone="brand">
        <Card>
          <CardContent className="divide-y py-2">
            {orgs.length === 0 && (
              <p className="py-6 text-center text-sm text-[hsl(var(--muted))]">No organisations.</p>
            )}
            {orgs.map((o) => {
              const on = o.ai_insights_enabled ?? true;
              return (
                <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{o.name}</p>
                    <p className="text-xs text-[hsl(var(--muted))]">
                      {on
                        ? 'Dashboard briefing and assistant are available. Occurrence data is sent to Groq when a briefing is generated.'
                        : 'Off — the briefing returns a clear message and nothing is sent to the model.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`AI briefing for ${o.name}`}
                    disabled={busyId === o.id}
                    onClick={() => toggle(o)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
                      on ? 'bg-brand-gradient' : 'bg-[hsl(var(--border))]'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        on ? 'left-6' : 'left-1'
                      }`}
                    />
                    {busyId === o.id && (
                      <Loader2 className="absolute -right-6 top-1.5 h-4 w-4 animate-spin text-[hsl(var(--muted))]" />
                    )}
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </GradientSection>

      <GradientSection title="What the assistant can see" icon="Sparkles" tone="slate">
        <Card>
          <CardContent className="space-y-2 py-5 text-sm text-[hsl(var(--muted))]">
            <p className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
              <span>
                When on, the briefing sends occurrence records — including descriptions and
                assignee names — to Groq for the organisation being viewed. The payload is
                assembled server-side, so the browser cannot widen it.
              </span>
            </p>
            <p className="pl-6">
              Figures shown on the dashboard are calculated from your database, not written by
              the model. Only the narrative and the recommended actions are AI-generated.
            </p>
          </CardContent>
        </Card>
      </GradientSection>
    </div>
  );
}
