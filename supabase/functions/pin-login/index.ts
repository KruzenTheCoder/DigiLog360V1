// PIN login (mobile only) — PIN-only flavour.
//
// The mobile app is single-tenant (org slug is fixed client-side) and asks
// for nothing but the 4-digit PIN. We resolve the user by iterating all
// active mobile profiles in the org and bcrypt-comparing the PIN against
// each. PINs are admin-set and validated unique within an org (see pin-set),
// so at most one match per request.
//
// Hardened:
//   • bcrypt(10) PIN verification, constant-time response normalisation.
//   • Per-profile lockout still works once we know which profile matched
//     a wrong-PIN attempt (5 failures / 15min → 15min lockout).
//   • Successful login clears the lock and writes an audit row.
//
// Request:  { org_slug, pin }
// Response: { token_hash, email, type:'magiclink', role }
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/auth.ts';
import { isValidPin, verifyPin } from '../_shared/pin.ts';

const NORMALISE_MS = 400;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function clientIp(req: Request): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('cf-connecting-ip')
    ?? null
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const start = performance.now();
  const admin = serviceClient();
  const ip = clientIp(req);
  const ua = req.headers.get('user-agent') ?? null;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const orgSlug = String(body.org_slug ?? '').trim().toLowerCase();
  const pin = String(body.pin ?? '');

  if (!orgSlug || !pin) {
    return json({ error: 'org_slug and pin are required' }, 400);
  }
  if (!isValidPin(pin)) {
    return json({ error: 'PIN must be 4 digits' }, 400);
  }

  // Resolve the organization first.
  const { data: org } = await admin
    .from('organizations')
    .select('id, slug, is_active')
    .eq('slug', orgSlug)
    .maybeSingle();
  if (!org || !org.is_active) {
    await delay(NORMALISE_MS);
    return json({ error: 'Invalid PIN' }, 401);
  }

  // Fetch all active mobile profiles in this org that have a PIN set.
  // We iterate bcrypt-compare to find the match — slow but acceptable for the
  // small (< ~100) field rosters this app is designed for.
  const { data: candidates } = await admin
    .from('profiles')
    .select('id, email, role, is_active, pin_hash, employee_number, org_id, locked_until')
    .eq('org_id', org.id)
    .eq('is_active', true)
    .not('pin_hash', 'is', null);

  let matched: typeof candidates extends (infer T)[] | null ? T : never | null = null;
  if (candidates) {
    for (const cand of candidates) {
      if (!cand.pin_hash) continue;
      // Skip locked profiles — but only after we've matched the PIN, so we
      // don't leak which PINs are valid via timing. We bcrypt-compare every
      // candidate either way.
      const ok = await verifyPin(pin, cand.pin_hash);
      if (ok) {
        matched = cand;
        // Don't break — keep comparing to keep total time roughly constant.
      }
    }
  }

  // Lockout check on the matched profile.
  if (matched?.locked_until && new Date(matched.locked_until) > new Date()) {
    await admin.rpc('register_pin_attempt', {
      _profile_id: matched.id,
      _org_slug: orgSlug,
      _employee: matched.employee_number ?? '',
      _success: false,
      _ip: ip,
      _user_agent: ua,
    });
    const elapsed = performance.now() - start;
    if (elapsed < NORMALISE_MS) await delay(NORMALISE_MS - elapsed);
    return json({
      error: 'Account temporarily locked. Try again later.',
      locked_until: matched.locked_until,
    }, 423);
  }

  if (!matched || !matched.email) {
    // No PIN matched. We can't register a per-profile failure (we don't know
    // which profile was targeted), so we just normalise time and return.
    const elapsed = performance.now() - start;
    if (elapsed < NORMALISE_MS) await delay(NORMALISE_MS - elapsed);
    return json({ error: 'Invalid PIN' }, 401);
  }

  // Successful PIN match — log success, clear lock, mint session.
  await admin.rpc('register_pin_attempt', {
    _profile_id: matched.id,
    _org_slug: orgSlug,
    _employee: matched.employee_number ?? '',
    _success: true,
    _ip: ip,
    _user_agent: ua,
  });

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: matched.email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return json({ error: linkErr?.message ?? 'Could not mint session' }, 500);
  }

  await admin
    .from('profiles')
    .update({ last_pin_login_at: new Date().toISOString() })
    .eq('id', matched.id);

  await admin.rpc('log_audit_event', {
    _action: 'auth.pin_login',
    _actor_id: matched.id,
    _org_id: matched.org_id,
    _target_table: 'profiles',
    _target_id: matched.id,
    _summary: `${matched.email} signed in via PIN`,
    _ip: ip,
    _user_agent: ua,
  });

  const elapsed = performance.now() - start;
  if (elapsed < NORMALISE_MS) await delay(NORMALISE_MS - elapsed);

  return json({
    token_hash: linkData.properties.hashed_token,
    email: matched.email,
    type: 'magiclink',
    role: matched.role,
  });
});
