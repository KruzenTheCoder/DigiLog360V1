// Send the onboarding "welcome pack" — sign-in link, username, and either a
// one-time password or a set-your-own-password link. Driven from
// Super User → Welcome Packs; not part of the task-alert outbox, because this
// is always a deliberate human action rather than an event reaction.
//
// POST body (one of):
//   { test_email: "someone@example.com", audience?: "new" | "existing" }
//       Preview send. Renders the SAMPLE payload and mails it to that address.
//       Touches no account and rotates no password — it exists purely to prove
//       the pipeline and let you eyeball the design in a real inbox.
//
//   { user_ids: [uuid, ...], mode?: "password" | "link", message?: string,
//     existing_user_ids?: [uuid, ...], previous_emails?: { uuid: "old@addr" } }
//       Real send, one mail per user.
//         mode "password" (default) — generates a one-time password, sets it on
//           the account, and prints it in the mail.
//         mode "link" — prints no secret; the recipient follows a Supabase
//           recovery link to choose their own password.
//         existing_user_ids — those already using Digilog360 whose sign-in
//           address changed. They get "your sign-in details have changed"
//           wording rather than "welcome aboard", because being welcomed to a
//           product you already use reads as a mistake.
//
// Every send is appended to email_log as event 'user.welcome', so welcome packs
// show up in the same audit history as the task alerts.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, isSuperUser } from '../_shared/auth.ts';
import {
  renderWelcomeEmail, sampleWelcomeEmailData,
  type WelcomeEmailData, type OrgEmailSettingsRow,
} from '../_shared/email-templates.ts';

const RESEND_URL = 'https://api.resend.com/emails';

// deno-lint-ignore no-explicit-any
type Sb = any;

const ROLE_LABELS: Record<string, string> = {
  super_user: 'Super User',
  admin: 'Administrator',
  manager: 'Manager',
  control_room: 'Control Room',
  supervisor: 'Supervisor',
  guard: 'Officer',
};

/**
 * One-time password: three short groups, no ambiguous glyphs (0/O, 1/l/I).
 * Long enough to be safe, shaped to be retyped off a phone screen without
 * squinting — these get read aloud and copied by hand more often than not.
 */
function generatePassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string, n: number) => {
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    return [...buf].map((v) => set[v % set.length]).join('');
  };
  return `${pick(upper, 1)}${pick(lower, 3)}-${pick(digits, 4)}-${pick(lower, 4)}`;
}

function fromHeader(orgFromName: string | null | undefined): string {
  const base = Deno.env.get('EMAIL_FROM') ?? 'Digilog360 <no-reply@digilog360.local>';
  if (!orgFromName?.trim()) return base;
  const addr = base.match(/<([^>]+)>/)?.[1] ?? base;
  return `${orgFromName.trim().replace(/[<>]/g, '')} <${addr}>`;
}

async function sendViaResend(opts: {
  to: string; subject: string; html: string; text: string;
  fromName?: string | null; replyTo?: string | null;
}): Promise<{ ok: boolean; dev?: boolean; error?: string; providerId?: string | null }> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.log('[welcome-pack DEV] to=%s subject=%s', opts.to, opts.subject);
    return { ok: true, dev: true, providerId: null };
  }
  const resp = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromHeader(opts.fromName),
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(opts.replyTo?.trim() ? { reply_to: opts.replyTo.trim() } : {}),
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false, error: `Resend ${resp.status}: ${body.slice(0, 300)}` };
  }
  const body = await resp.json().catch(() => ({}));
  return { ok: true, providerId: (body?.id as string | undefined) ?? null };
}

/** Ledger append — best effort, never blocks or fails a send. */
async function logDelivery(admin: Sb, entry: Record<string, unknown>) {
  await admin.from('email_log').insert(entry).then(
    (r: { error: { message: string } | null }) => {
      if (r.error) console.error('email_log insert failed:', r.error.message);
    },
    (e: unknown) => console.error('email_log insert threw:', e),
  );
}

async function loadOrg(admin: Sb, orgId: string) {
  const [{ data: org }, { data: settings }] = await Promise.all([
    admin.from('organizations').select('id, name').eq('id', orgId).maybeSingle(),
    admin.from('org_email_settings').select('*').eq('org_id', orgId).maybeSingle(),
  ]);
  return {
    name: (org?.name as string) ?? 'Digilog360',
    settings: (settings as OrgEmailSettingsRow | null) ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);
  const { profile: caller } = result;
  if (!caller) return json({ error: 'No profile for caller' }, 403);
  if (!isSuperUser(caller) && caller.role !== 'admin') {
    return json({ error: 'Admin role required' }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const appUrl = (Deno.env.get('PUBLIC_APP_URL') ?? '').replace(/\/+$/, '') || null;
  const callerOrgId = (caller as { org_id?: string }).org_id ?? '';
  const org = await loadOrg(admin, callerOrgId);
  const senderName = (caller as { full_name?: string }).full_name ?? null;
  const message = body.message ? String(body.message).trim() : null;

  // ── Preview send ─────────────────────────────────────────────────────────
  // Deliberately isolated from the real path: sample data only, no lookup of
  // any account, no password written anywhere.
  const testEmail = body.test_email ? String(body.test_email).trim() : '';
  if (testEmail) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testEmail)) {
      return json({ error: 'test_email is not a valid address' }, 400);
    }
    const previewAudience = body.audience === 'existing' ? 'existing' : 'new';
    const data = sampleWelcomeEmailData(org.name, appUrl, previewAudience);
    if (message) data.message = message;
    data.senderName = senderName ?? data.senderName;
    const { subject, html, text } = renderWelcomeEmail(data, org.settings);
    const sent = await sendViaResend({
      to: testEmail, subject, html, text,
      fromName: org.settings?.from_name, replyTo: org.settings?.reply_to,
    });
    await logDelivery(admin, {
      org_id: callerOrgId,
      event: 'user.welcome',
      recipient_email: testEmail,
      recipient_name: 'Preview send',
      subject,
      status: sent.dev ? 'dev' : sent.ok ? 'sent' : 'failed',
      provider_id: sent.providerId ?? null,
      error: sent.error ?? null,
      is_test: true,
    });
    return sent.ok
      ? json({ ok: true, test: true, dev: !!sent.dev, sent_to: testEmail })
      : json({ error: sent.error ?? 'Send failed' }, 502);
  }

  // ── Real send ────────────────────────────────────────────────────────────
  const userIds = Array.isArray(body.user_ids) ? body.user_ids.map(String) : [];
  if (userIds.length === 0) {
    return json({ error: 'Provide test_email, or user_ids to send to' }, 400);
  }
  if (userIds.length > 50) {
    return json({ error: 'Send to at most 50 users at a time' }, 400);
  }
  const mode = body.mode === 'link' ? 'link' : 'password';
  // Subset of user_ids that are EXISTING users whose sign-in address changed —
  // they get the "your details have changed" wording instead of "welcome".
  const existingIds = new Set(
    Array.isArray(body.existing_user_ids) ? body.existing_user_ids.map(String) : [],
  );
  // Optional { user_id: "old@address" } map, so the mail can name the login
  // being replaced.
  const previousEmails = (body.previous_emails ?? {}) as Record<string, string>;

  let q = admin.from('profiles').select('id, full_name, email, role, org_id').in('id', userIds);
  // Org admins never reach outside their own organisation.
  if (!isSuperUser(caller)) q = q.eq('org_id', callerOrgId);
  const { data: targets, error: loadErr } = await q;
  if (loadErr) return json({ error: `Could not load users: ${loadErr.message}` }, 500);

  const rows = (targets ?? []) as Array<{
    id: string; full_name: string | null; email: string | null;
    role: string | null; org_id: string;
  }>;

  const results: Array<{ user_id: string; email: string | null; ok: boolean; error?: string }> = [];

  for (const u of rows) {
    const to = (u.email ?? '').trim();
    if (!to) {
      results.push({ user_id: u.id, email: null, ok: false, error: 'No email address on this account' });
      continue;
    }

    // Each user may sit in a different org (super user sending across orgs),
    // so branding follows the recipient rather than the sender.
    const theirOrg = u.org_id === callerOrgId ? org : await loadOrg(admin, u.org_id);

    let password: string | null = null;
    let setPasswordUrl: string | null = null;

    if (mode === 'password') {
      password = generatePassword();
      const { error: pwErr } = await admin.auth.admin.updateUserById(u.id, { password });
      if (pwErr) {
        results.push({ user_id: u.id, email: to, ok: false, error: `Password reset failed: ${pwErr.message}` });
        continue;
      }
    } else {
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: to,
        options: appUrl ? { redirectTo: `${appUrl}/login` } : undefined,
      });
      if (linkErr) {
        results.push({ user_id: u.id, email: to, ok: false, error: `Link generation failed: ${linkErr.message}` });
        continue;
      }
      setPasswordUrl = (link?.properties?.action_link as string | undefined) ?? null;
    }

    const data: WelcomeEmailData = {
      recipientName: (u.full_name ?? '').split(' ')[0] || null,
      email: to,
      password,
      setPasswordUrl,
      orgName: theirOrg.name,
      appUrl,
      roleLabel: u.role ? (ROLE_LABELS[u.role] ?? u.role) : null,
      message,
      senderName,
      audience: existingIds.has(u.id) ? 'existing' : 'new',
      previousEmail: previousEmails[u.id] ?? null,
    };
    const { subject, html, text } = renderWelcomeEmail(data, theirOrg.settings);
    const sent = await sendViaResend({
      to, subject, html, text,
      fromName: theirOrg.settings?.from_name, replyTo: theirOrg.settings?.reply_to,
    });

    await logDelivery(admin, {
      org_id: u.org_id,
      event: 'user.welcome',
      recipient_id: u.id,
      recipient_name: u.full_name,
      recipient_email: to,
      subject,
      status: sent.dev ? 'dev' : sent.ok ? 'sent' : 'failed',
      provider_id: sent.providerId ?? null,
      error: sent.error ?? null,
      is_test: false,
    });

    results.push({ user_id: u.id, email: to, ok: sent.ok, error: sent.error });
  }

  // Anything requested but not returned by the query was filtered out by the
  // org guard or simply doesn't exist — report it rather than silently drop it.
  for (const id of userIds) {
    if (!rows.some((r) => r.id === id)) {
      results.push({ user_id: id, email: null, ok: false, error: 'User not found in your organisation' });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return json({ ok: true, sent: okCount, failed: results.length - okCount, mode, results });
});
