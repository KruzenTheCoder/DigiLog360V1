'use client';

// Super User → AI Assistant & Features.
//
// Per-tenant control of the two AI products and of which roles can see the
// newer surfaces. The AI switches gate the EDGE FUNCTION, not just the UI:
// switched off, the function refuses and nothing is sent to Groq for that
// organisation at all.

import { useState } from 'react';
import { AlertCircle, Check, Loader2, Mail, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { GradientSection } from '@/components/ui/gradient-section';

interface Org {
  id: string; name: string;
  ai_insights_enabled: boolean | null;
  ai_chat_enabled: boolean | null;
  ai_weekly_digest_enabled: boolean | null;
  ai_digest_roles: string[] | null;
}
export interface FeatureRow { org_id: string; feature_key: string; roles: string[] | null }

const DIGEST_ROLES = [
  { key: 'admin', label: 'Administrators' },
  { key: 'manager', label: 'Managers' },
  { key: 'supervisor', label: 'Supervisors' },
  { key: 'control_room', label: 'Control Room' },
];

// Surfaces that can be handed out role by role. A super user always sees them.
const FEATURES = [
  { key: 'organogram', label: 'Organogram', hint: 'Reporting structure and escalation routing' },
  { key: 'inspections', label: 'Site Inspections', hint: 'Schedules, calendar and geo check-in' },
  { key: 'ai_assistant', label: 'AI Assistant (menu item)', hint: 'The chat page in the sidebar' },
];

const ALL_ROLES = [
  { key: 'admin', label: 'Admin' },
  { key: 'manager', label: 'Manager' },
  { key: 'control_room', label: 'Control Room' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'guard', label: 'Officer' },
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

export function AiSettingsManager({
  orgs: initialOrgs, features: initialFeatures,
}: {
  orgs: Org[];
  features: FeatureRow[];
}) {
  const [orgs, setOrgs] = useState<Org[]>(initialOrgs);
  const [features, setFeatures] = useState<FeatureRow[]>(initialFeatures);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = () => createClient() as any;

  async function update(org: Org, patch: Partial<Org>, note: string) {
    setBusyId(org.id);
    setMsg(null);
    const { error } = await sb().from('organizations').update(patch).eq('id', org.id);
    setBusyId(null);
    if (error) { setMsg({ kind: 'error', text: error.message }); return; }
    setOrgs((os) => os.map((o) => (o.id === org.id ? { ...o, ...patch } : o)));
    setMsg({ kind: 'ok', text: note });
  }

  const rolesFor = (orgId: string, key: string) =>
    features.find((f) => f.org_id === orgId && f.feature_key === key)?.roles ?? [];

  async function toggleFeatureRole(orgId: string, key: string, role: string, orgName: string, featureLabel: string) {
    const current = rolesFor(orgId, key);
    const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
    setBusyId(orgId);
    setMsg(null);
    const { error } = await sb().from('org_feature_roles')
      .upsert({ org_id: orgId, feature_key: key, roles: next, updated_at: new Date().toISOString() },
        { onConflict: 'org_id,feature_key' });
    setBusyId(null);
    if (error) { setMsg({ kind: 'error', text: error.message }); return; }
    setFeatures((fs) => {
      const without = fs.filter((f) => !(f.org_id === orgId && f.feature_key === key));
      return [...without, { org_id: orgId, feature_key: key, roles: next }];
    });
    setMsg({
      kind: 'ok',
      text: next.length === 0
        ? `${featureLabel} is now super-user only at ${orgName}.`
        : `${featureLabel} at ${orgName}: ${next.length} role${next.length === 1 ? '' : 's'}.`,
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

      <GradientSection title="AI features by organisation" icon="Sparkles" tone="brand">
        <div className="space-y-4">
          {orgs.map((o) => {
            const insights = o.ai_insights_enabled ?? true;
            const chat = o.ai_chat_enabled ?? true;
            const weekly = o.ai_weekly_digest_enabled ?? false;
            const digestRoles = o.ai_digest_roles ?? ['admin', 'manager'];
            return (
              <Card key={o.id}>
                <CardContent className="space-y-3 py-4">
                  <p className="flex items-center gap-2 font-semibold">
                    {o.name}
                    {busyId === o.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  </p>

                  {/* The dashboard briefing */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">KPI briefing on the dashboard</p>
                      <p className="text-xs text-[hsl(var(--muted))]">
                        {insights
                          ? 'Generates the written read, KPIs and recommended actions.'
                          : 'Off — the dashboard panel refuses and sends nothing to the model.'}
                      </p>
                    </div>
                    <Switch
                      on={insights} busy={busyId === o.id}
                      label={`KPI briefing for ${o.name}`}
                      onClick={() => update(o, { ai_insights_enabled: !insights }, insights
                        ? `KPI briefing switched off for ${o.name}.`
                        : `KPI briefing switched on for ${o.name}.`)}
                    />
                  </div>

                  {/* The chat assistant */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">AI assistant (chat)</p>
                      <p className="text-xs text-[hsl(var(--muted))]">
                        {chat
                          ? 'The Operations Assistant page can answer questions about this org.'
                          : 'Off — the assistant refuses and sends nothing to the model.'}
                      </p>
                    </div>
                    <Switch
                      on={chat} busy={busyId === o.id}
                      label={`AI assistant for ${o.name}`}
                      onClick={() => update(o, { ai_chat_enabled: !chat }, chat
                        ? `AI assistant switched off for ${o.name}.`
                        : `AI assistant switched on for ${o.name}.`)}
                    />
                  </div>

                  {/* Weekly digest */}
                  <div className={`rounded-xl border p-3 ${insights ? '' : 'opacity-50'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <Mail className="h-3.5 w-3.5" /> Weekly &ldquo;week ahead&rdquo; email
                        </p>
                        <p className="text-xs text-[hsl(var(--muted))]">
                          Monday morning, one edition per role.
                        </p>
                      </div>
                      <Switch
                        on={weekly} busy={busyId === o.id || !insights}
                        label={`Weekly digest for ${o.name}`}
                        onClick={() => update(o, { ai_weekly_digest_enabled: !weekly }, !weekly
                          ? `Weekly digest switched on for ${o.name}.`
                          : `Weekly digest switched off for ${o.name}.`)}
                      />
                    </div>
                    {weekly && insights && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                        {DIGEST_ROLES.map((r) => {
                          const picked = digestRoles.includes(r.key);
                          return (
                            <button
                              key={r.key} type="button" disabled={busyId === o.id}
                              onClick={() => update(o, {
                                ai_digest_roles: picked
                                  ? digestRoles.filter((x) => x !== r.key)
                                  : [...digestRoles, r.key],
                              }, picked ? `${r.label} removed from the digest.` : `${r.label} added to the digest.`)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                                picked
                                  ? 'border-[hsl(var(--brand))] bg-[hsl(var(--brand))] text-white'
                                  : 'border-[hsl(var(--border))] hover:border-[hsl(var(--brand))]'
                              }`}
                            >{r.label}</button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </GradientSection>

      <GradientSection
        title="Feature visibility by role"
        subtitle="Which roles see each surface in their sidebar and menu. Super users always see everything."
        icon="SlidersHorizontal"
        tone="violet"
      >
        <div className="space-y-4">
          {orgs.map((o) => (
            <Card key={o.id}>
              <CardContent className="space-y-3 py-4">
                <p className="font-semibold">{o.name}</p>
                {FEATURES.map((f) => {
                  const picked = rolesFor(o.id, f.key);
                  return (
                    <div key={f.key} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">{f.label}</p>
                        <p className="text-[11px] text-[hsl(var(--muted))]">
                          {picked.length === 0 ? 'Super user only' : `${picked.length} role${picked.length === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">{f.hint}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ALL_ROLES.map((r) => {
                          const on = picked.includes(r.key);
                          return (
                            <button
                              key={r.key} type="button" disabled={busyId === o.id}
                              onClick={() => toggleFeatureRole(o.id, f.key, r.key, o.name, f.label)}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                                on
                                  ? 'border-[hsl(var(--brand))] bg-[hsl(var(--brand))] text-white'
                                  : 'border-[hsl(var(--border))] hover:border-[hsl(var(--brand))]'
                              }`}
                            >{r.label}</button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
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
              see their own sites. Figures are calculated from your database, not written by
              the model.
            </p>
          </CardContent>
        </Card>
      </GradientSection>
    </div>
  );
}
