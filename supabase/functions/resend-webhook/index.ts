// Resend delivery events → email_log.
//
// Handing a message to Resend is not the same as it arriving. This endpoint
// receives what happens afterwards — delivered, bounced, complained, delayed —
// and writes it onto the ledger row for that provider id, so the Delivery
// history in the console shows whether an alert actually landed.
//
// Configure it in the Resend dashboard (Webhooks → Add endpoint) pointing at
//   https://<project-ref>.supabase.co/functions/v1/resend-webhook
// subscribed to email.delivered, email.bounced, email.complained and
// email.delivery_delayed, then set the signing secret:
//   npx supabase secrets set RESEND_WEBHOOK_SECRET=whsec_...
//
// Requests are signed with Svix headers. We verify before trusting anything —
// this endpoint is public, so an unverified body is an unauthenticated
// stranger telling us an alert bounced.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/auth.ts';

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    bounce?: { type?: string; subType?: string; message?: string };
    reason?: string;
  };
}

/** Constant-time comparison so a bad signature leaks nothing via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a Svix-signed payload, the scheme Resend uses.
 *
 * The signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the
 * secret (base64 after the `whsec_` prefix). The header may carry several
 * space-separated `v1,<sig>` values during a secret rotation, so any match
 * counts.
 */
async function verify(req: Request, raw: string, secret: string): Promise<boolean> {
  const id = req.headers.get('svix-id') ?? req.headers.get('webhook-id');
  const timestamp = req.headers.get('svix-timestamp') ?? req.headers.get('webhook-timestamp');
  const header = req.headers.get('svix-signature') ?? req.headers.get('webhook-signature');
  if (!id || !timestamp || !header) return false;

  // Reject anything older than five minutes so a captured request cannot be
  // replayed back at us later.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const keyBytes = Uint8Array.from(
    atob(secret.startsWith('whsec_') ? secret.slice(6) : secret),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${raw}`),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));

  return header
    .split(' ')
    .map((part) => part.split(',')[1] ?? '')
    .some((sig) => sig && safeEqual(sig, expected));
}

/** Resend event name → the status we record. */
const STATUS: Record<string, string> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delivery_delayed',
  'email.sent': 'sent',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const raw = await req.text();

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) {
    // Fail closed. Accepting unsigned events would let anyone mark alerts as
    // bounced, which is worse than recording nothing.
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET is not set — rejecting');
    return json({ error: 'Webhook not configured' }, 503);
  }
  if (!(await verify(req, raw, secret))) {
    return json({ error: 'Invalid signature' }, 401);
  }

  let event: ResendEvent;
  try { event = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const status = STATUS[event.type ?? ''];
  const providerId = event.data?.email_id;

  // Unknown or uninteresting events (opens, clicks) are acknowledged so Resend
  // stops retrying, but nothing is written.
  if (!status || !providerId) return json({ ok: true, ignored: event.type ?? 'unknown' });

  const admin = serviceClient();

  const patch: Record<string, unknown> = {
    provider_status: status,
    provider_status_at: event.created_at ?? new Date().toISOString(),
  };
  if (status === 'bounced') {
    patch.bounce_type = event.data?.bounce?.type ?? event.data?.bounce?.subType ?? 'unknown';
    patch.bounce_detail = event.data?.bounce?.message ?? event.data?.reason ?? null;
  }
  if (status === 'complained') {
    patch.bounce_type = 'complaint';
    patch.bounce_detail = event.data?.reason ?? 'Recipient marked the message as spam';
  }

  const { data, error } = await admin
    .from('email_log')
    .update(patch)
    .eq('provider_id', providerId)
    .select('id');

  if (error) {
    console.error('[resend-webhook] update failed:', error.message);
    return json({ error: 'Could not record event' }, 500);
  }

  // A message we never logged (an older send, or one from another system) is
  // not an error — acknowledge it rather than making Resend retry forever.
  return json({ ok: true, event: event.type, matched: (data ?? []).length });
});
