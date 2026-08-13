'use client';

// Super User → Welcome Packs.
//
// Onboarding mail for people who already have an account: where to sign in,
// the address that doubles as their username, and how to get in the first
// time. Two things matter in the design here —
//
//   1. The preview send is genuinely inert. It renders the SAMPLE payload and
//      mails it wherever you point it; it never looks up an account and never
//      rotates a password. That is what makes it safe to fire at yourself
//      before touching anyone real.
//   2. The real send is explicit about consequences. Choosing "one-time
//      password" resets that person's password the moment you send, so the
//      button says so and asks for confirmation first.
//
// The preview iframe is rendered by the SAME template module the edge function
// uses, so what you see is what lands in the inbox.

import { useMemo, useState } from 'react';
import {
  AlertCircle, Check, KeyRound, Link2, Loader2, Search, SendHorizonal, Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { GradientSection } from '@/components/ui/gradient-section';
import { formatDateTime } from '@/lib/utils';
import { renderWelcomeEmail, sampleWelcomeEmailData } from '@digilog/shared';

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean | null;
  org_id: string | null;
}

interface LogRow {
  id: number;
  recipient_name: string | null;
  recipient_email: string;
  subject: string;
  status: string;
  error: string | null;
  is_test: boolean;
  created_at: string;
}

type SendMode = 'password' | 'link';

const ROLE_LABELS: Record<string, string> = {
  super_user: 'Super User',
  admin: 'Administrator',
  manager: 'Manager',
  control_room: 'Control Room',
  supervisor: 'Supervisor',
  guard: 'Officer',
};

const STATUS_TONE: Record<string, string> = {
  sent: '#16a34a',
  failed: '#dc2626',
  dev: '#64748b',
};

interface Props {
  users: UserRow[];
  orgName: string;
  appUrl: string | null;
  currentUserEmail: string;
  initialLog: LogRow[];
}

export function WelcomePacksManager({
  users, orgName, appUrl, currentUserEmail, initialLog,
}: Props) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Who is already a Digilog360 user. Anyone not in here is treated as new.
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<SendMode>('password');
  const [message, setMessage] = useState('');
  const [previewAudience, setPreviewAudience] = useState<'new' | 'existing'>('new');

  const [testTo, setTestTo] = useState(currentUserEmail);
  const [testBusy, setTestBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [results, setResults] = useState<Array<{ email: string | null; ok: boolean; error?: string }>>([]);
  const [log, setLog] = useState<LogRow[]>(initialLog);

  const roles = useMemo(
    () => [...new Set(users.map((u) => u.role).filter(Boolean))] as string[],
    [users],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return `${u.full_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q);
    });
  }, [users, query, roleFilter]);

  // Someone with no address on file can't be mailed — surfaced in the row
  // rather than silently failing at send time.
  const selectable = visible.filter((u) => !!u.email?.trim());
  const allShownSelected = selectable.length > 0 && selectable.every((u) => selected.has(u.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleExisting(id: string) {
    setExisting((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) selectable.forEach((u) => next.delete(u.id));
      else selectable.forEach((u) => next.add(u.id));
      return next;
    });
  }

  async function refreshLog() {
    const supabase = createClient();
    // email_log isn't in the generated types yet — same escape hatch the
    // Email Alerts manager uses for the ledger.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const { data } = await sb
      .from('email_log')
      .select('id, recipient_name, recipient_email, subject, status, error, is_test, created_at')
      .eq('event', 'user.welcome')
      .order('id', { ascending: false })
      .limit(50);
    if (data) setLog(data as unknown as LogRow[]);
  }

  async function sendTest() {
    const to = testTo.trim();
    if (!to) {
      setBanner({ kind: 'error', text: 'Enter an address to send the preview to.' });
      return;
    }
    setTestBusy(true);
    setBanner(null);
    setResults([]);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke('send-welcome-pack', {
      body: {
        test_email: to,
        audience: previewAudience,
        ...(message.trim() ? { message: message.trim() } : {}),
      },
    });
    setTestBusy(false);
    const d = data as { ok?: boolean; dev?: boolean; sent_to?: string; error?: string } | null;
    if (error || !d?.ok) {
      setBanner({ kind: 'error', text: d?.error ?? error?.message ?? 'Preview send failed' });
    } else {
      setBanner({
        kind: 'ok',
        text: d.dev
          ? 'Dev mode (no RESEND_API_KEY set) — the function logged the email instead of sending it.'
          : `Preview sent to ${d.sent_to}. No account was changed.`,
      });
      void refreshLog();
    }
  }

  async function sendReal() {
    setConfirming(false);
    setSendBusy(true);
    setBanner(null);
    setResults([]);
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke('send-welcome-pack', {
      body: {
        user_ids: [...selected],
        // Only those actually being sent to — an existing-user tick on someone
        // who isn't selected is irrelevant.
        existing_user_ids: [...selected].filter((id) => existing.has(id)),
        mode,
        ...(message.trim() ? { message: message.trim() } : {}),
      },
    });
    setSendBusy(false);
    const d = data as {
      ok?: boolean; sent?: number; failed?: number; error?: string;
      results?: Array<{ email: string | null; ok: boolean; error?: string }>;
    } | null;
    if (error || !d?.ok) {
      setBanner({ kind: 'error', text: d?.error ?? error?.message ?? 'Send failed' });
      return;
    }
    setResults(d.results ?? []);
    setBanner({
      kind: d.failed ? 'error' : 'ok',
      text: d.failed
        ? `Sent ${d.sent}, failed ${d.failed}. See the breakdown below.`
        : `Welcome pack sent to ${d.sent} ${d.sent === 1 ? 'person' : 'people'}.`,
    });
    setSelected(new Set());
    void refreshLog();
  }

  // Live preview — same renderer the edge function calls.
  const preview = useMemo(() => {
    const sample = sampleWelcomeEmailData(orgName, appUrl, previewAudience);
    if (message.trim()) sample.message = message.trim();
    if (mode === 'link') {
      sample.password = null;
      sample.setPasswordUrl = `${(appUrl ?? 'https://digilog360.example').replace(/\/+$/, '')}/login`;
    }
    return renderWelcomeEmail(sample);
  }, [orgName, appUrl, message, mode, previewAudience]);

  return (
    <div className="space-y-5">
      {banner && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            banner.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
          }`}
        >
          {banner.kind === 'ok' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{banner.text}</span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        {/* ── Left: who + how ─────────────────────────────────────────── */}
        <div className="space-y-5">
          <GradientSection title="Send a preview first" icon="SendHorizonal" tone="sky">
            <Card>
              <CardContent className="space-y-3 py-5">
                <p className="text-sm text-[hsl(var(--muted))]">
                  Sends the sample pack to any address so you can check how it looks and that
                  delivery works. It uses placeholder details — no account is looked up, and
                  nobody&apos;s password changes.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-1 max-w-[26rem]">
                    <Label>Send preview to</Label>
                    <Input
                      type="email"
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <Button variant="secondary" onClick={sendTest} disabled={testBusy}>
                    {testBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                    Send preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          </GradientSection>

          <GradientSection title="Choose the recipients" icon="Users" tone="brand">
            <Card>
              <CardContent className="space-y-4 py-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-0 flex-1 max-w-[22rem]">
                    <Label>Search</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
                      <Input
                        className="pl-9"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Name or email"
                      />
                    </div>
                  </div>
                  <div className="w-44">
                    <Label>Role</Label>
                    <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                      <option value="all">All roles</option>
                      {roles.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                      ))}
                    </Select>
                  </div>
                  <Button variant="ghost" onClick={toggleAllShown} disabled={selectable.length === 0}>
                    {allShownSelected ? 'Clear shown' : 'Select shown'}
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <TR>
                        <TH className="w-10"> </TH>
                        <TH>Name</TH>
                        <TH>Sign-in address</TH>
                        <TH>Role</TH>
                        <TH className="whitespace-nowrap">Already a user?</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {visible.length === 0 && (
                        <TR><TD colSpan={5} className="py-6 text-center text-sm text-[hsl(var(--muted))]">No users match.</TD></TR>
                      )}
                      {visible.map((u) => {
                        const mailable = !!u.email?.trim();
                        return (
                          <TR key={u.id}>
                            <TD>
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-[hsl(var(--brand))]"
                                checked={selected.has(u.id)}
                                disabled={!mailable}
                                onChange={() => toggle(u.id)}
                                aria-label={`Select ${u.full_name ?? u.email ?? 'user'}`}
                              />
                            </TD>
                            <TD className="text-sm font-medium">
                              {u.full_name ?? '—'}
                              {u.is_active === false && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-[hsl(var(--muted))]">inactive</span>
                              )}
                            </TD>
                            <TD className="text-sm">
                              {mailable
                                ? <span className="font-mono text-xs">{u.email}</span>
                                : <span className="text-xs italic text-[hsl(var(--muted))]">no address on file</span>}
                            </TD>
                            <TD className="text-sm">{u.role ? (ROLE_LABELS[u.role] ?? u.role) : '—'}</TD>
                            <TD>
                              <label className="flex cursor-pointer items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[hsl(var(--brand))]"
                                  checked={existing.has(u.id)}
                                  onChange={() => toggleExisting(u.id)}
                                />
                                <span className={existing.has(u.id) ? 'font-medium' : 'text-[hsl(var(--muted))]'}>
                                  {existing.has(u.id) ? 'Existing user' : 'New user'}
                                </span>
                              </label>
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </GradientSection>

          <GradientSection title="How they get in" icon="KeyRound" tone="violet">
            <Card>
              <CardContent className="space-y-4 py-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setMode('password')}
                    className={`rounded-xl border p-4 text-left transition ${
                      mode === 'password'
                        ? 'border-[hsl(var(--brand))] bg-[hsl(var(--brand))]/5 ring-1 ring-[hsl(var(--brand))]'
                        : 'border-[hsl(var(--border))] hover:border-[hsl(var(--brand))]/50'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <KeyRound className="h-4 w-4" /> One-time password
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-[hsl(var(--muted))]">
                      Generates a password, sets it on the account, and prints it in the email.
                      <strong className="text-amber-600 dark:text-amber-400"> This replaces their current password.</strong>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('link')}
                    className={`rounded-xl border p-4 text-left transition ${
                      mode === 'link'
                        ? 'border-[hsl(var(--brand))] bg-[hsl(var(--brand))]/5 ring-1 ring-[hsl(var(--brand))]'
                        : 'border-[hsl(var(--border))] hover:border-[hsl(var(--brand))]/50'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <Link2 className="h-4 w-4" /> Set-your-own-password link
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-[hsl(var(--muted))]">
                      No password in the email. They follow a secure link and choose their own —
                      safer, and their current password keeps working until they do.
                    </span>
                  </button>
                </div>

                <div>
                  <Label>Personal note (optional)</Label>
                  <Textarea
                    rows={2}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Great to have you on the team — shout if anything looks off on your first shift."
                  />
                </div>

                {confirming ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Send to {selected.size} {selected.size === 1 ? 'person' : 'people'}?
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                      {mode === 'password'
                        ? 'Each person’s password will be reset to a new one-time password and emailed to them. Anyone already signed in stays signed in, but their old password stops working.'
                        : 'Each person gets a link to choose their own password. Existing passwords keep working until they use it.'}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button onClick={sendReal} disabled={sendBusy}>
                        {sendBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                        Yes, send now
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => setConfirming(true)}
                      disabled={selected.size === 0 || sendBusy}
                    >
                      <SendHorizonal className="h-4 w-4" />
                      Send welcome pack{selected.size > 0 ? ` to ${selected.size}` : ''}
                    </Button>
                    <span className="text-xs text-[hsl(var(--muted))]">
                      {selected.size === 0
                        ? 'Select at least one person above.'
                        : `${selected.size} selected`}
                    </span>
                  </div>
                )}

                {results.length > 0 && (
                  <ul className="space-y-1 border-t pt-3 text-xs">
                    {results.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {r.ok
                          ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          : <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />}
                        <span className="font-mono">{r.email ?? 'unknown'}</span>
                        {r.error && <span className="text-red-600">— {r.error}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </GradientSection>
        </div>

        {/* ── Right: preview ──────────────────────────────────────────── */}
        <div className="space-y-5">
          <GradientSection title="Preview" icon="Mail" tone="green">
            <Card>
              <CardContent className="space-y-3 py-5">
                {/* Which wording to look at — and what a preview send delivers. */}
                <div className="flex gap-1 rounded-lg border p-1">
                  {(['new', 'existing'] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setPreviewAudience(a)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                        previewAudience === a
                          ? 'bg-brand-gradient text-white'
                          : 'text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'
                      }`}
                    >
                      {a === 'new' ? 'New user' : 'Existing user'}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">Subject</p>
                  <p className="text-sm font-medium">{preview.subject}</p>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <iframe
                    title="Welcome pack preview"
                    srcDoc={preview.html}
                    className="h-[38rem] w-full bg-white"
                    sandbox=""
                  />
                </div>
                <p className="text-xs text-[hsl(var(--muted))]">
                  Rendered by the same template the sender uses. Details shown are placeholders.
                </p>
              </CardContent>
            </Card>
          </GradientSection>
        </div>
      </div>

      {/* ── History ───────────────────────────────────────────────────── */}
      <GradientSection title="Recent welcome packs" icon="History" tone="slate">
        <Card>
          <CardContent className="py-5">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Sent at</TH>
                    <TH>Recipient</TH>
                    <TH>Subject</TH>
                    <TH>Result</TH>
                  </TR>
                </THead>
                <TBody>
                  {log.length === 0 && (
                    <TR><TD colSpan={4} className="py-6 text-center text-sm text-[hsl(var(--muted))]">No welcome packs sent yet.</TD></TR>
                  )}
                  {log.map((l) => (
                    <TR key={l.id}>
                      <TD className="whitespace-nowrap text-xs">{formatDateTime(l.created_at)}</TD>
                      <TD className="text-sm">
                        <span className="font-mono text-xs">{l.recipient_email}</span>
                        {l.is_test && <span className="ml-2 text-[10px] uppercase tracking-wide text-[hsl(var(--muted))]">preview</span>}
                      </TD>
                      <TD className="max-w-[26rem] truncate text-sm" title={l.subject}>{l.subject}</TD>
                      <TD>
                        <Badge color={STATUS_TONE[l.status] ?? '#64748b'}>{l.status}</Badge>
                        {l.error && (
                          <span className="mt-0.5 block max-w-[18rem] truncate text-[10px] text-red-600" title={l.error}>
                            {l.error}
                          </span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </GradientSection>
    </div>
  );
}
