// Deliver an occurrence/SLA event to all active org webhooks.
//
// Body (called from sla-monitor / cron / triggers):
//   { org_id: string, event: string, payload: object }
//
// For each matching active webhook:
//   • POST `payload` with HMAC-SHA256 signature header (`X-DigiLog-Signature`)
//   • Record delivery in webhook_deliveries with status code
//   • Update last_delivered_at / last_status on the webhook row
//
// Auth: x-internal-key OR signed-in admin.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, isSuperUser } from '../_shared/auth.ts';

async function sign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const internal = req.headers.get('x-internal-key') === Deno.env.get('INTERNAL_FN_KEY');
  if (!internal) {
    const result = await requireUser(req, admin);
    if (result.error) return json({ error: result.error }, 401);
    if (!isSuperUser(result.profile) && result.profile?.role !== 'admin') {
      return json({ error: 'Admin required' }, 403);
    }
  }

  let body: { org_id?: string; event?: string; payload?: unknown };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  if (!body.org_id || !body.event) return json({ error: 'org_id + event required' }, 400);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: hooks } = await (admin as any)
    .from('org_webhooks')
    .select('*')
    .eq('org_id', body.org_id)
    .eq('is_active', true);

  const deliveries: { webhook_id: string; status: number | null; ok: boolean }[] = [];
  for (const h of (hooks ?? []) as Array<{
    id: string; url: string; secret: string; events: string[]; org_id: string;
  }>) {
    if (!h.events.includes(body.event!) && !h.events.includes('*')) continue;

    const bodyStr = JSON.stringify({
      event: body.event,
      delivered_at: new Date().toISOString(),
      org_id: body.org_id,
      data: body.payload,
    });
    const sig = await sign(h.secret, bodyStr);

    let status: number | null = null;
    let responseText = '';
    try {
      const resp = await fetch(h.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DigiLog-Event': body.event!,
          'X-DigiLog-Signature': sig,
          'User-Agent': 'DigiLog360-Webhook/1.0',
        },
        body: bodyStr,
      });
      status = resp.status;
      responseText = (await resp.text()).slice(0, 1000);
    } catch (e) {
      status = null;
      responseText = e instanceof Error ? e.message : 'fetch failed';
    }

    await admin.from('webhook_deliveries').insert({
      webhook_id: h.id, org_id: h.org_id, event: body.event,
      status, request_body: JSON.parse(bodyStr), response_body: responseText,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('org_webhooks')
      .update({ last_delivered_at: new Date().toISOString(), last_status: status })
      .eq('id', h.id);

    deliveries.push({ webhook_id: h.id, status, ok: !!status && status < 400 });
  }

  return json({ delivered: deliveries.length, results: deliveries });
});
