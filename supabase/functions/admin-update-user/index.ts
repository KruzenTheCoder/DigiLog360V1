// Update a user: role, site, name, phone, password reset, activate/deactivate,
// employee number, PIN (admin reset). Admin (same org) or super_user only.
import { corsHeaders, json } from '../_shared/cors.ts';
import {
  serviceClient, requireUser, isSuperUser, AppRole, ALL_ROLES,
} from '../_shared/auth.ts';
import { hashPin, isValidPin } from '../_shared/pin.ts';

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
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const userId = String(body.user_id ?? '');
  if (!userId) return json({ error: 'user_id is required' }, 400);

  // Same-org enforcement for org admins.
  if (!isSuperUser(caller)) {
    const { data: target } = await admin
      .from('profiles')
      .select('org_id, role')
      .eq('id', userId)
      .maybeSingle();
    if (!target) return json({ error: 'Target user not found' }, 404);
    if (target.org_id !== caller.org_id) {
      return json({ error: 'Cross-org operation not allowed' }, 403);
    }
    if (target.role === 'super_user') {
      return json({ error: 'Cannot modify a super user' }, 403);
    }
  }

  const profilePatch: Record<string, unknown> = {};
  const authPatch: Record<string, unknown> = {};

  if (body.role !== undefined) {
    const role = String(body.role) as AppRole;
    if (!ALL_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400);
    if (role === 'super_user' && !isSuperUser(caller)) {
      return json({ error: 'Only the super user can grant super_user' }, 403);
    }
    profilePatch.role = role;
  }

  if (body.roles !== undefined) {
    if (!Array.isArray(body.roles) || body.roles.length === 0) {
      return json({ error: 'roles must be a non-empty array' }, 400);
    }
    const rolesArray = (body.roles as unknown[]).map(String) as AppRole[];
    for (const r of rolesArray) {
      if (!ALL_ROLES.includes(r)) return json({ error: `Invalid role: ${r}` }, 400);
    }
    if (rolesArray.includes('super_user') && !isSuperUser(caller)) {
      return json({ error: 'Only the super user can grant super_user' }, 403);
    }
    profilePatch.roles = rolesArray;
    // Keep primary in sync with the first role.
    if (profilePatch.role === undefined) profilePatch.role = rolesArray[0];
  }
  if (body.site_id !== undefined) profilePatch.site_id = body.site_id ? String(body.site_id) : null;
  if (body.site_ids !== undefined) {
    if (!Array.isArray(body.site_ids)) {
      return json({ error: 'site_ids must be an array of site UUIDs' }, 400);
    }
    profilePatch.site_ids = (body.site_ids as unknown[]).map(String);
  }
  if (body.full_name !== undefined) profilePatch.full_name = body.full_name ? String(body.full_name) : null;
  if (body.phone !== undefined) profilePatch.phone = body.phone ? String(body.phone) : null;
  if (body.employee_number !== undefined) {
    profilePatch.employee_number = body.employee_number ? String(body.employee_number).trim() : null;
  }
  if (body.is_active !== undefined) profilePatch.is_active = Boolean(body.is_active);

  // Super-user only: move user to another org.
  if (body.org_id !== undefined) {
    if (!isSuperUser(caller)) return json({ error: 'Only super_user may reassign org' }, 403);
    profilePatch.org_id = body.org_id ? String(body.org_id) : null;
  }

  if (body.password !== undefined) {
    const pw = String(body.password);
    if (pw.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
    authPatch.password = pw;
  }
  if (body.is_active !== undefined) {
    authPatch.ban_duration = body.is_active ? 'none' : '876000h';
  }

  if (body.pin !== undefined) {
    const pin = String(body.pin);
    if (!isValidPin(pin)) return json({ error: 'PIN must be 4 digits' }, 400);
    profilePatch.pin_hash = await hashPin(pin);
    profilePatch.pin_set_at = new Date().toISOString();
  } else if (body.clear_pin === true) {
    profilePatch.pin_hash = null;
  }

  if (Object.keys(authPatch).length > 0) {
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, authPatch);
    if (authErr) return json({ error: authErr.message }, 400);
  }
  if (Object.keys(profilePatch).length > 0) {
    const { error: profErr } = await admin.from('profiles').update(profilePatch).eq('id', userId);
    if (profErr) return json({ error: profErr.message }, 400);
  }

  await admin.rpc('log_audit_event', {
    _action: 'user.update',
    _actor_id: caller.id,
    _org_id: caller.org_id,
    _target_table: 'profiles',
    _target_id: userId,
    _summary: `User ${userId} updated`,
    _metadata: { changed: Object.keys({ ...profilePatch, ...authPatch }) },
  });

  return json({ id: userId, ...profilePatch });
});
