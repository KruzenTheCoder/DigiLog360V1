// Set / rotate a user's PIN. Two call modes:
//
//   1. Admin sets PIN for another user:
//      { user_id: string, pin: string }
//      Caller must be admin (same org) or super_user.
//
//   2. User changes their own PIN:
//      { pin: string, current_pin?: string }
//      If the user already has a PIN, current_pin is required.
//
// Stored as bcrypt(10).
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, isSuperUser } from '../_shared/auth.ts';
import { hashPin, isValidPin, verifyPin } from '../_shared/pin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);
  const { user, profile } = result;
  if (!profile) return json({ error: 'No profile for caller' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const targetId = body.user_id ? String(body.user_id) : user.id;
  const newPin = String(body.pin ?? '');
  if (!isValidPin(newPin)) return json({ error: 'PIN must be 4 digits' }, 400);

  const isSelf = targetId === user.id;

  if (!isSelf) {
    // Admin path: must be admin (same org) or super_user.
    if (!isSuperUser(profile) && profile.role !== 'admin') {
      return json({ error: 'Admin role required' }, 403);
    }
    // Same-org check (skipped for super_user).
    if (!isSuperUser(profile)) {
      const { data: target } = await admin
        .from('profiles')
        .select('org_id')
        .eq('id', targetId)
        .maybeSingle();
      if (!target) return json({ error: 'Target user not found' }, 404);
      if (target.org_id !== profile.org_id) {
        return json({ error: 'Cross-org operation not allowed' }, 403);
      }
    }
  } else {
    // Self path: enforce current_pin if one already exists.
    const { data: me } = await admin
      .from('profiles')
      .select('pin_hash')
      .eq('id', targetId)
      .single();

    if (me?.pin_hash) {
      const currentPin = String(body.current_pin ?? '');
      if (!currentPin) return json({ error: 'current_pin is required' }, 400);
      const ok = await verifyPin(currentPin, me.pin_hash);
      if (!ok) return json({ error: 'current_pin is incorrect' }, 401);
    }
  }

  // Determine the target's org so we can enforce PIN uniqueness within it.
  // Mobile login is PIN-only, so two users in the same org cannot share a PIN.
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', targetId)
    .maybeSingle();
  const targetOrgId = targetProfile?.org_id ?? profile.org_id;

  if (targetOrgId) {
    const { data: peers } = await admin
      .from('profiles')
      .select('id, pin_hash')
      .eq('org_id', targetOrgId)
      .eq('is_active', true)
      .neq('id', targetId)
      .not('pin_hash', 'is', null);
    if (peers) {
      for (const peer of peers) {
        if (peer.pin_hash && await verifyPin(newPin, peer.pin_hash)) {
          return json({ error: 'PIN already in use by another user. Pick a different PIN.' }, 409);
        }
      }
    }
  }

  const pin_hash = await hashPin(newPin);
  const { error } = await admin
    .from('profiles')
    .update({ pin_hash, pin_set_at: new Date().toISOString() })
    .eq('id', targetId);
  if (error) return json({ error: error.message }, 400);

  await admin.rpc('log_audit_event', {
    _action: isSelf ? 'pin.self_change' : 'pin.admin_reset',
    _actor_id: user.id,
    _org_id: profile.org_id,
    _target_table: 'profiles',
    _target_id: targetId,
    _summary: isSelf ? 'User changed own PIN' : 'Admin reset PIN for user',
  });

  return json({ ok: true, user_id: targetId });
});
