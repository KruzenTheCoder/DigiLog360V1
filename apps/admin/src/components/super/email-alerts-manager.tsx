'use client';

// Super User → Email Alerts.
//
// Per-organisation configuration of the Resend-powered task emails:
// master switch, sender identity, accent colour, footer, and per-event
// enable/subject/intro overrides — with a live preview iframe rendered by
// the SAME template module the edge function uses, so the preview is
// pixel-identical to what recipients receive. A test-send button delivers a
// sample email (with the org's live config) to the signed-in super user.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Building2, Check, History, Loader2, Mail, RotateCcw, Save,
  Search, SendHorizonal,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import {
  TASK_EMAIL_EVENTS, TASK_EMAIL_EVENT_META,
  DEFAULT_EMAIL_SUBJECTS, DEFAULT_EMAIL_INTROS, DEFAULT_EMAIL_SETTINGS,
  EMAIL_TEMPLATE_VARS, renderTaskEmail, sampleTaskEmailData,
  type TaskEmailEvent, type OrgEmailSettingsRow, type EmailEventConfig,
} from '@digilog/shared';

interface OrgRow { id: string; name: string; slug: string; is_active: boolean }

/** Row of public.email_log — the per-recipient delivery ledger. */
interface EmailLogRow {
  id: number;
  event: string;
  task_id: number | null;
  occurrence_id: number | null;
  ob_number: string | null;
  recipient_name: string | null;
  recipient_email: string;
  subject: string;
  status: 'sent' | 'failed' | 'dev';
  provider_id: string | null;
  error: string | null;
  is_test: boolean;
  created_at: string;
}

const LOG_STATUS_META: Record<EmailLogRow['status'], { label: string; color: string }> = {
  sent: { label: 'Sent', color: '#16a34a' },
  failed: { label: 'Failed', color: '#dc2626' },
  dev: { label: 'Dev (logged only)', color: '#64748b' },
};

type Draft = Omit<OrgEmailSettingsRow, 'org_id' | 'updated_at' | 'updated_by'>;

function draftFor(row: OrgEmailSettingsRow | undefined): Draft {
  if (!row) return { ...DEFAULT_EMAIL_SETTINGS, events: {} };
  return {
    enabled: row.enabled,
    from_name: row.from_name,
    reply_to: row.reply_to,
    accent_color: row.accent_color,
    footer_note: row.footer_note,
    notify_admins_on_breach: row.notify_admins_on_breach,
    events: row.events ?? {},
  };
}

export function EmailAlertsManager({
  orgs, settings,
}: {
  orgs: OrgRow[];
  settings: OrgEmailSettingsRow[];
}) {
  const settingsByOrg = useMemo(() => {
    const m = new Map<string, OrgEmailSettingsRow>();
    for (const s of settings) m.set(s.org_id, s);
    return m;
  }, [settings]);

  const [orgId, setOrgId] = useState<string>(orgs[0]?.id ?? '');
  const [draft, setDraft] = useState<Draft>(() => draftFor(settingsByOrg.get(orgs[0]?.id ?? '')));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [previewEvent, setPreviewEvent] = useState<TaskEmailEvent>('task.assigned');
  // The sample data contains "now"-relative timestamps, so the rendered
  // preview differs between server and client passes — render it only after
  // mount to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Delivery history (email_log ledger) ──
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [logsBusy, setLogsBusy] = useState(false);
  const [logFilter, setLogFilter] = useState<'all' | 'sent' | 'failed' | 'dev' | 'test'>('all');
  const [logQ, setLogQ] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  const loadLogs = useCallback(async (org: string) => {
    if (!org) return;
    setLogsBusy(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const [logsRes, pendRes] = await Promise.all([
      sb.from('email_log').select('*')
        .eq('org_id', org).order('id', { ascending: false }).limit(200),
      sb.from('email_outbox').select('id', { count: 'exact', head: true })
        .eq('org_id', org).eq('status', 'pending'),
    ]);
    setLogs((logsRes.data ?? []) as EmailLogRow[]);
    setPendingCount(pendRes.count ?? 0);
    setLogsBusy(false);
  }, []);

  useEffect(() => { void loadLogs(orgId); }, [orgId, loadLogs]);

  const visibleLogs = useMemo(() => logs.filter((l) => {
    if (logFilter === 'test') {
      if (!l.is_test) return false;
    } else if (logFilter !== 'all' && l.status !== logFilter) {
      return false;
    }
    const needle = logQ.trim().toLowerCase();
    if (needle) {
      const hay = `${l.recipient_email} ${l.recipient_name ?? ''} ${l.subject} ${l.ob_number ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }), [logs, logFilter, logQ]);

  const org = orgs.find((o) => o.id === orgId);

  function switchOrg(next: string) {
    if (dirty && !confirm('Discard unsaved changes for this organisation?')) return;
    setOrgId(next);
    setDraft(draftFor(settingsByOrg.get(next)));
    setDirty(false);
    setMessage(null);
  }

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  }

  function patchEvent(event: TaskEmailEvent, p: Partial<EmailEventConfig>) {
    setDraft((d) => ({
      ...d,
      events: { ...d.events, [event]: { ...(d.events[event] ?? {}), ...p } },
    }));
    setDirty(true);
  }

  async function save() {
    if (!orgId) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('org_email_settings')
      .upsert({ org_id: orgId, ...draft }, { onConflict: 'org_id' });
    setBusy(false);
    if (error) {
      setMessage({ kind: 'error', text: error.message });
    } else {
      setDirty(false);
      settingsByOrg.set(orgId, { org_id: orgId, ...draft });
      setMessage({ kind: 'ok', text: 'Saved — new emails use this configuration immediately.' });
    }
  }

  async function sendTest() {
    if (dirty) {
      setMessage({ kind: 'error', text: 'Save your changes first — test sends use the saved configuration.' });
      return;
    }
    setTestBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke('task-alerts', {
      body: {
        mode: 'test', org_id: orgId, event: previewEvent,
        ...(testTo.trim() ? { to: testTo.trim() } : {}),
      },
    });
    setTestBusy(false);
    const d = data as { ok?: boolean; to?: string; dev?: boolean; error?: string } | null;
    if (error || !d?.ok) {
      setMessage({ kind: 'error', text: d?.error ?? error?.message ?? 'Test send failed' });
    } else {
      setMessage({
        kind: 'ok',
        text: d.dev
          ? `Dev mode (no RESEND_API_KEY configured) — the email was logged by the function instead of sent.`
          : `Test email sent to ${d.to} — check that inbox.`,
      });
      void loadLogs(orgId);
    }
  }

  // Live preview — rendered by the exact module the edge function uses.
  const preview = useMemo(() => {
    const sample = sampleTaskEmailData(org?.name ?? 'DigiLog 360');
    if (previewEvent === 'task.completed') sample.status = 'done';
    if (previewEvent.startsWith('occurrence.')) {
      sample.title = 'Perimeter Intrusion';
      sample.priority = 'critical';
      sample.urlPath = 'occurrences';
      sample.taskId = sample.occurrenceId ?? sample.taskId;
      if (previewEvent === 'occurrence.assigned') {
        sample.status = 'open';
        sample.notes = null;
      } else {
        sample.status = 'in_progress';
        sample.notes = 'Armed response on scene, perimeter secured. Awaiting SAPS case number.';
      }
    }
    return renderTaskEmail(previewEvent, sample, { org_id: orgId, ...draft });
  }, [previewEvent, draft, org?.name, orgId]);

  const masterOn = draft.enabled !== false;

  return (
    <div className="space-y-5">
      {/* ── Org picker ── */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Building2 className="h-4 w-4 text-brand" />
          <Label className="mb-0">Organisation</Label>
          <Select value={orgId} onChange={(e) => switchOrg(e.target.value)} className="w-72">
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}{o.is_active ? '' : ' (inactive)'}
              </option>
            ))}
          </Select>
          {org && <Badge color="#667eea">/{org.slug}</Badge>}
          <div className="ml-auto flex items-center gap-2">
            {dirty && <span className="text-xs font-medium text-amber-600">Unsaved changes</span>}
            <Button onClick={save} disabled={busy || !dirty}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {message && (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
          message.kind === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
        }`}>
          {message.kind === 'ok'
            ? <Check className="mt-0.5 h-4 w-4 shrink-0" />
            : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          {message.text}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ── Left column: configuration ── */}
        <div className="space-y-5">
          {/* Who receives what */}
          <Card>
            <CardContent className="py-5">
              <h2 className="mb-1 font-semibold">Who receives each email</h2>
              <p className="mb-3 text-xs text-[hsl(var(--muted))]">
                Emails go to the task&apos;s two parties — the person who assigned it and the person
                it&apos;s assigned to. Whoever performed the action is skipped (nobody is emailed
                about their own change).
              </p>
              <ul className="divide-y rounded-xl border text-sm">
                {([
                  ['task.assigned', 'The assignee — “you have a new task”. The assigner made the change, so they are not emailed.'],
                  ['occurrence.assigned', 'The reviewer it was assigned to — from the log form, the detail-page assignment card, or a bulk assign.'],
                  ['task.updated', 'Assigner + assignee, excluding whoever posted the update (e.g. the assignee updates → the assigner is emailed).'],
                  ['occurrence.updated', 'The assigned reviewer + whoever logged it, excluding the person who made the change. Only assigned occurrences send these.'],
                  ['task.completed', 'Assigner + assignee, excluding whoever completed it — so the person who handed the task out always hears it is done.'],
                  ['task.overdue', 'Assignee + assigner, plus every org admin if “copy org admins” is on below.'],
                ] as Array<[TaskEmailEvent, string]>).map(([event, who]) => (
                  <li key={event} className="flex items-start gap-3 px-4 py-2.5">
                    <span
                      className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: TASK_EMAIL_EVENT_META[event].color }}
                    />
                    <div>
                      <span className="font-medium">{TASK_EMAIL_EVENT_META[event].label}</span>
                      <span className="text-[hsl(var(--muted))]"> — {who}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-[hsl(var(--muted))]">
                Recipients must have an email on their profile, and individual users can opt out under
                Settings → My Preferences (assignment emails additionally respect the “notify on assignment” preference).
              </p>
            </CardContent>
          </Card>

          {/* Sender & branding */}
          <Card>
            <CardContent className="space-y-4 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold">
                    <Mail className="h-4 w-4 text-brand" /> Email alerts
                  </h2>
                  <p className="text-xs text-[hsl(var(--muted))]">
                    Master switch for all task emails in this organisation. In-app and push notifications are unaffected.
                  </p>
                </div>
                <Toggle on={masterOn} onChange={(v) => patch({ enabled: v })} ariaLabel="Enable email alerts" />
              </div>

              <div className={masterOn ? '' : 'pointer-events-none opacity-50'}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Sender name</Label>
                    <Input
                      value={draft.from_name ?? ''}
                      onChange={(e) => patch({ from_name: e.target.value || null })}
                      placeholder="DigiLog 360"
                    />
                    <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">
                      Display name only — the address comes from the platform&apos;s verified Resend domain.
                    </p>
                  </div>
                  <div>
                    <Label>Reply-to</Label>
                    <Input
                      value={draft.reply_to ?? ''}
                      onChange={(e) => patch({ reply_to: e.target.value || null })}
                      placeholder="controlroom@client.co.za"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Accent colour</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={draft.accent_color ?? '#667eea'}
                        onChange={(e) => patch({ accent_color: e.target.value })}
                        className="h-10 w-12 cursor-pointer rounded-lg border bg-transparent"
                        aria-label="Accent colour"
                      />
                      <Input
                        value={draft.accent_color ?? ''}
                        onChange={(e) => patch({ accent_color: e.target.value || null })}
                        placeholder="#667eea (default)"
                        className="font-mono text-xs"
                      />
                      {draft.accent_color && (
                        <Button size="sm" variant="ghost" onClick={() => patch({ accent_color: null })} aria-label="Reset colour">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Copy org admins on overdue alerts</Label>
                    <div className="flex h-10 items-center">
                      <Toggle
                        on={!!draft.notify_admins_on_breach}
                        onChange={(v) => patch({ notify_admins_on_breach: v })}
                        ariaLabel="Notify admins on breach"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <Label>Footer note (optional)</Label>
                  <Textarea
                    value={draft.footer_note ?? ''}
                    onChange={(e) => patch({ footer_note: e.target.value || null })}
                    className="min-h-[60px]"
                    placeholder="e.g. For urgent matters phone the 24-hour control room on 010 123 4567."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Per-event configuration */}
          {TASK_EMAIL_EVENTS.map((event) => {
            const meta = TASK_EMAIL_EVENT_META[event];
            const cfg = draft.events[event] ?? {};
            const on = masterOn && cfg.enabled !== false;
            return (
              <Card key={event}>
                <CardContent className="space-y-3 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                        {meta.label}
                      </h3>
                      <p className="text-xs text-[hsl(var(--muted))]">{meta.description}</p>
                    </div>
                    <Toggle
                      on={cfg.enabled !== false}
                      onChange={(v) => patchEvent(event, { enabled: v })}
                      ariaLabel={`Enable ${meta.label} emails`}
                    />
                  </div>

                  <div className={on ? '' : 'pointer-events-none opacity-50'}>
                    <Label>Subject</Label>
                    <Input
                      value={cfg.subject ?? ''}
                      onChange={(e) => patchEvent(event, { subject: e.target.value || undefined })}
                      placeholder={DEFAULT_EMAIL_SUBJECTS[event]}
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {EMAIL_TEMPLATE_VARS.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => patchEvent(event, {
                            subject: `${cfg.subject ?? DEFAULT_EMAIL_SUBJECTS[event]} {{${v}}}`,
                          })}
                          className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          title={`Append {{${v}}} to the subject`}
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3">
                      <Label>Intro paragraph</Label>
                      <Textarea
                        value={cfg.intro ?? ''}
                        onChange={(e) => patchEvent(event, { intro: e.target.value || undefined })}
                        className="min-h-[60px]"
                        placeholder={DEFAULT_EMAIL_INTROS[event]}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ── Right column: live preview ── */}
        <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardContent className="space-y-3 py-4">
              <h2 className="font-semibold">Live preview</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="Test recipient — blank sends to your account email"
                  className="min-w-56 flex-1"
                />
                <Button size="sm" variant="secondary" onClick={sendTest} disabled={testBusy}>
                  {testBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                  Send test
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {TASK_EMAIL_EVENTS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setPreviewEvent(e)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      previewEvent === e
                        ? 'text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                    }`}
                    style={previewEvent === e ? { background: TASK_EMAIL_EVENT_META[e].color } : undefined}
                  >
                    {TASK_EMAIL_EVENT_META[e].label}
                  </button>
                ))}
              </div>
              <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900/40">
                <span className="mr-2 text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted))]">Subject</span>
                {mounted ? preview.subject : '…'}
              </div>
              {mounted && (
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview.html}
                  className="h-[640px] w-full rounded-xl border bg-white"
                />
              )}
              <p className="text-[11px] text-[hsl(var(--muted))]">
                Rendered by the same template module the edge function uses — what you see is what recipients get.
                Sample data is shown; real emails substitute the actual task, people and organisation.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Delivery history — the full outgoing-mail audit ── */}
      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                <History className="h-4 w-4 text-brand" /> Delivery history
              </h2>
              <p className="text-xs text-[hsl(var(--muted))]">
                Every email this organisation has sent (or tried to send) — one row per recipient,
                with the Resend message ID as proof of hand-off. Latest 200 shown.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <Badge color="#d97706">{pendingCount} queued — sends within a minute</Badge>
              )}
              <Button size="sm" variant="secondary" onClick={() => loadLogs(orgId)} disabled={logsBusy}>
                {logsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([
              ['all', 'All'], ['sent', 'Sent'], ['failed', 'Failed'], ['dev', 'Dev'], ['test', 'Tests'],
            ] as Array<[typeof logFilter, string]>).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setLogFilter(key)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  logFilter === key
                    ? 'bg-brand text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
            <div className="relative ml-auto">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
              <Input
                value={logQ}
                onChange={(e) => setLogQ(e.target.value)}
                placeholder="Search recipient, subject, OB…"
                className="w-64 pl-9"
              />
            </div>
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Sent at</TH><TH>Event</TH><TH>Recipient</TH>
                <TH>Subject</TH><TH>Ref</TH><TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {visibleLogs.map((l) => {
                const meta = TASK_EMAIL_EVENT_META[l.event as TaskEmailEvent];
                const status = LOG_STATUS_META[l.status];
                return (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">
                      {formatDateTime(l.created_at)}
                    </TD>
                    <TD>
                      <span className="flex items-center gap-1.5">
                        <Badge color={meta?.color ?? '#64748b'}>{meta?.label ?? l.event}</Badge>
                        {l.is_test && <Badge color="#7c3aed">Test</Badge>}
                      </span>
                    </TD>
                    <TD className="text-sm">
                      <span className="font-medium">{l.recipient_name ?? '—'}</span>
                      <span className="block text-xs text-[hsl(var(--muted))]">{l.recipient_email}</span>
                    </TD>
                    <TD className="max-w-[26rem] truncate text-sm" title={l.subject}>{l.subject}</TD>
                    <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">
                      {l.ob_number ?? (l.task_id ? `Task #${l.task_id}` : '—')}
                    </TD>
                    <TD>
                      <Badge color={status.color}>{status.label}</Badge>
                      {l.provider_id && (
                        <span className="block max-w-[10rem] truncate font-mono text-[10px] text-[hsl(var(--muted))]" title={l.provider_id}>
                          {l.provider_id}
                        </span>
                      )}
                      {l.error && (
                        <span className="block max-w-[16rem] truncate text-[10px] text-red-600" title={l.error}>
                          {l.error}
                        </span>
                      )}
                    </TD>
                  </TR>
                );
              })}
              {visibleLogs.length === 0 && (
                <TR><TD colSpan={6} className="py-8 text-center text-[hsl(var(--muted))]">
                  {logsBusy ? 'Loading…' : 'No deliveries recorded yet — the ledger starts with the next email sent.'}
                </TD></TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle({
  on, onChange, ariaLabel,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={ariaLabel}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-sm transition ${
          on ? 'translate-x-5' : 'translate-x-1'
        }`}
      >
        {on ? <Check className="h-3 w-3 text-emerald-500" /> : null}
      </span>
    </button>
  );
}
