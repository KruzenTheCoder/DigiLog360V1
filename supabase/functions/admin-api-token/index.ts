// Mint or revoke an API token. Admin (own org) or super_user.
//
// POST mode "create":  { mode:'create', name:string, scopes?:string[], expires_at?:string }
//   Returns { id, token } once — token is NEVER retrievable again.
// POST mode "revoke":  { mode:'revoke', id:string }
//
// Token format: `dl_live_<24-char-random>` (40 chars total).
// Server stores SHA-256 of the token; client gets the plaintext exactly once.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, isSuperUser } from '../_shared/auth.ts';

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes).map((b) => b.toString(36)).join('').slice(0, 24);
  return `dl_live_${body}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);
  if (!isSuperUser(result.profile) && result.profile?.role !== 'admin') {
    return json({ error: 'Admin required' }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const mode = String(body.mode ?? '');

  if (mode === 'create') {
    const name = String(body.name ?? '').trim();
    if (!name) return json({ error: 'name required' }, 400);
    const scopes = Array.isArray(body.scopes)
      ? (body.scopes as unknown[]).map(String)
      : ['read:occurrences'];
    const expires_at = body.expires_at ? String(body.expires_at) : null;

    const token = randomToken();
    const prefix = token.slice(0, 12);                 // "dl_live_abcd"
    const hashed = await sha256Hex(token);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).from('api_tokens').insert({
      org_id: isSuperUser(result.profile) ? body.org_id ?? result.profile?.org_id : result.profile?.org_id,
      name, prefix, hashed_secret: hashed, scopes,
      created_by: result.profile?.id, expires_at,
    }).select('id, prefix').single();
    if (error) return json({ error: error.message }, 400);

    await admin.rpc('log_audit_event', {
      _action: 'api_token.create',
      _actor_id: result.profile?.id,
      _org_id: result.profile?.org_id,
      _target_table: 'api_tokens',
      _target_id: data.id,
      _summary: `Created API token "${name}"`,
    }).catch(() => {});

    return json({ id: data.id, prefix: data.prefix, token }, 201);
  }

  if (mode === 'revoke') {
    const id = String(body.id ?? '');
    if (!id) return json({ error: 'id required' }, 400);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from('api_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return json({ error: error.message }, 400);

    await admin.rpc('log_audit_event', {
      _action: 'api_token.revoke',
      _actor_id: result.profile?.id,
      _org_id: result.profile?.org_id,
      _target_table: 'api_tokens',
      _target_id: id,
    }).catch(() => {});
    return json({ ok: true });
  }

  return json({ error: 'Invalid mode' }, 400);
});
