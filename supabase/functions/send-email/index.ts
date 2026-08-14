// Generic email dispatcher. Uses Resend by default; falls back to logging
// if RESEND_API_KEY is not configured (so dev environments don't fail loudly).
//
// Body:
//   { to: string | string[], subject: string, html?: string, text?: string,
//     audit?: { action: string, target_table?: string, target_id?: string } }
//
// Auth: requires a signed-in admin/manager/control_room/super_user OR the
// `x-internal-key` header matching INTERNAL_FN_KEY (for cron triggers).
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, isSuperUser } from '../_shared/auth.ts';

const RESEND_URL = 'https://api.resend.com/emails';
const FROM = Deno.env.get('EMAIL_FROM') ?? 'Digilog360 <no-reply@digilog360.local>';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const internalKey = req.headers.get('x-internal-key');
  const expectedKey = Deno.env.get('INTERNAL_FN_KEY');

  if (!internalKey || internalKey !== expectedKey) {
    // Fall back to user auth.
    const result = await requireUser(req, admin);
    if (result.error) return json({ error: result.error }, 401);
    if (!isSuperUser(result.profile) && !['admin', 'manager', 'control_room'].includes(result.profile?.role ?? '')) {
      return json({ error: 'Insufficient role' }, 403);
    }
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const to = Array.isArray(body.to) ? (body.to as string[]) : body.to ? [String(body.to)] : [];
  const subject = String(body.subject ?? '').trim();
  const html = body.html ? String(body.html) : undefined;
  const text = body.text ? String(body.text) : undefined;

  if (to.length === 0 || !subject) {
    return json({ error: 'to + subject required' }, 400);
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) {
    // Dev fallback — log only.
    console.log('[send-email DEV] to=%j subject=%j', to, subject);
    return json({ ok: true, dev: true, would_send: { to, subject } });
  }

  const resp = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html, text }),
  });
  const responseBody = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return json({ error: 'Provider error', details: responseBody }, 502);
  }

  if (body.audit && typeof body.audit === 'object') {
    const a = body.audit as Record<string, unknown>;
    await admin.rpc('log_audit_event', {
      _action: String(a.action ?? 'email.send'),
      _target_table: a.target_table ? String(a.target_table) : null,
      _target_id: a.target_id ? String(a.target_id) : null,
      _summary: `Sent "${subject}" to ${to.join(', ')}`,
    }).catch(() => {});
  }

  return json({ ok: true, provider_id: responseBody });
});
