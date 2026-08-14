'use client';

// Super User → AI Assistant.
//
// One master switch per organisation plus the weekly digest settings. The
// master switch gates the EDGE FUNCTION, not merely the UI — turned off, the
// dashboard briefing, the chat assistant and the weekly email all refuse, and
// no occurrence text is sent to Groq for that organisation at all.

import { useState } from 'react';
import { AlertCircle, Check, Loader2, Mail, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { GradientSection } from '@/components/ui/gradient-section';

interface Org {
  id: string; name: string;
  ai_insights_enabled: boolean | null;
  ai_weekly_digest_enabled: boolean | null;
  ai_digest_roles: string[] | null;
}

const DIGEST_ROLES = [
  { key: 'admin', label: 'Administrators' },
  { key: 'manager', label: 'Managers' },
  { key: 'supervisor', label: 'Supervisors' },
  { key: 'control_room', label: 'Control Room' },
];

function Switch({
  on, busy, label, onClick,
}: { on: boolean; busy: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label}
      disabled={busy} onClick={onClick}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
        on ? 'bg-brand-gradient' : 'bg-[hsl(var(--border))]'
      }`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

export function AiSettingsManager({ orgs: initial }: { orgs: Org[] }) {
  const [orgs, setOrgs] = useState<Org[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // One writer for every control on this page, so they cannot drift apart.
  async function update(org: Org, patch: Partial<Org>, note: string) {
    setBusyId(org.id);
    setMsg(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const { error } = await sb.from('organizations').update(patch).eq('id', org.id);
    setBusyId(null);
    if (error) { setMsg({ kind: 'error', text: error.message }); return; }
    setOrgs((os) => os.map((o) => (o.id === org.id ? { ...o, ...patch } : o)));
    setMsg({ kind: 'ok', text: note });
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

      <GradientSection title="AI features by organisation" icon="Sparkles" tone="brand">
        <div className="space-y-4">
          {orgs.length === 0 && (
            <p className="py-6 text-center text-sm text-[hsl(var(--muted))]">No organisations.</p>
          )}
          {orgs.map((o) => {
            const on = o.ai_insights_enabled ?? true;
            const weekly = o.ai_weekly_digest_enabled ?? false;
            const roles = o.ai_digest_roles ?? ['admin', 'manager'];
            return (
              <Card key={o.id}>
                <CardContent className="space-y-4 py-4">
                  {/* Master switch */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold">
                        {o.name}
                        {busyId === o.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted))]">
                        {on
                          ? 'Dashboard briefing, chat assistant and weekly email are available.'
                          : 'All AI features off — nothing is sent to the model for this organisation.'}
                      </p>
                    </div>
                    <Switch
                      on={on} busy={busyId === o.id}
                      label={`All AI features for ${o.name}`}
                      onClick={() => update(o, { ai_insights_enabled: !on }, on
                        ? `AI switched off for ${o.name} — no occurrence data will be sent to the model.`
                        : `AI switched on for ${o.name}.`)}
                    />
                  </div>

                  {/* Weekly digest, only meaningful while AI is on */}
                  <div className={`rounded-xl border p-3 ${on ? '' : 'opacity-50'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <Mail className="h-3.5 w-3.5" /> Weekly &ldquo;week ahead&rdquo; email
                        </p>
                        <p className="text-xs text-[hsl(var(--muted))]">
                          Monday morning. One edition per role, written for that role, sent to
                          everyone holding it.
                        </p>
                      </div>
                      <Switch
                        on={weekly} busy={busyId === o.id || !on}
                        label={`Weekly digest for ${o.name}`}
                        onClick={() => update(o, { ai_weekly_digest_enabled: !weekly }, !weekly
                          ? `Weekly digest switched on for ${o.name}.`
                          : `Weekly digest switched off for ${o.name}.`)}
                      />
                    </div>

                    {weekly && on && (
                      <div className="mt-3 border-t pt-3">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
                          Who receives it
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {DIGEST_ROLES.map((r) => {
                            const picked = roles.includes(r.key);
                            return (
                              <button
                                key={r.key}
                                type="button"
                                disabled={busyId === o.id}
                                onClick={() => update(
                                  o,
                                  { ai_digest_roles: picked ? roles.filter((x) => x !== r.key) : [...roles, r.key] },
                                  picked ? `${r.label} removed from the digest.` : `${r.label} added to the digest.`,
                                )}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                                  picked
                                    ? 'border-[hsl(var(--brand))] bg-[hsl(var(--brand))] text-white'
                                    : 'border-[hsl(var(--border))] hover:border-[hsl(var(--brand))]'
                                }`}
                              >
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                        {roles.length === 0 && (
                          <p className="mt-2 text-xs text-amber-600">
                            Nobody selected — the digest will not be sent.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </GradientSection>

      <GradientSection title="What the assistant can see" icon="Sparkles" tone="slate">
        <Card>
          <CardContent className="space-y-2 py-5 text-sm text-[hsl(var(--muted))]">
            <p className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
              <span>
                While AI is on, occurrence records — including descriptions and assignee
                names — are sent to Groq for the organisation being viewed. The payload is
                assembled server-side, so the browser cannot widen it.
              </span>
            </p>
            <p className="pl-6">
              Briefings are written for the reader&apos;s role, and people below manager only
              see their own sites. Figures on the dashboard are calculated from your database,
              not written by the model — only the narrative and the recommended actions are
              AI-generated.
            </p>
          </CardContent>
        </Card>
      </GradientSection>
    </div>
  );
}
