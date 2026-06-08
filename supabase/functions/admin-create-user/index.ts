// Create an auth user + profile. Replaces the legacy Admin/CreateUser action.
//
// Auth model:
//   • super_user can create any role in any org (must pass org_id).
//   • admin can create non-super_user roles in their own org only.
//
// Body:
//   { email, password?, role, full_name?, site_id?, phone?, org_id?,
//     employee_number?, pin? }
//
// If `pin` is supplied, it's bcrypt-hashed and stored — the guard/supervisor
// can then sign in via the pin-login function on mobile.
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
  const { profile } = result;
  if (!profile) return json({ error: 'No profile for caller' }, 403);
  if (!isSuperUser(profile) && profile.role !== 'admin') {
    return json({ error: 'Admin role required' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = body.password ? String(body.password) : null;

  // Accept either `role` (single) or `roles` (array). Whichever is present,
  // we end up with a non-empty `rolesArray` and a `primaryRole = rolesArray[0]`.
  const rawRoles: AppRole[] = Array.isArray(body.roles)
    ? (body.roles as unknown[]).map(String) as AppRole[]
    : body.role ? [String(body.role) as AppRole] : ['guard'];
  const role = rawRoles[0];
  const rolesArray = rawRoles;
  const full_name = body.full_name ? String(body.full_name) : null;
  const site_id = body.site_id ? String(body.site_id) : null;
  // Multi-site assignment. Always include site_id (legacy primary) so the
  // two never drift apart. Defaults to [site_id] if site_ids isn't supplied.
  const site_ids: string[] = Array.isArray(body.site_ids)
    ? Array.from(new Set([
      ...(body.site_ids as unknown[]).map(String),
      ...(site_id ? [site_id] : []),
    ]))
    : (site_id ? [site_id] : []);
  const phone = body.phone ? String(body.phone) : null;
  const employee_number = body.employee_number
    ? String(body.employee_number).trim()
    : null;
  const pin = body.pin ? String(body.pin) : null;
  const org_id_input = body.org_id ? String(body.org_id) : null;

  if (!email) return json({ error: 'email is required' }, 400);
  if (rolesArray.length === 0) return json({ error: 'At least one role is required' }, 400);
  for (const r of rolesArray) {
    if (!ALL_ROLES.includes(r)) return json({ error: `Invalid role: ${r}` }, 400);
  }

  // Only super_user can grant super_user.
  if (rolesArray.includes('super_user') && !isSuperUser(profile)) {
    return json({ error: 'Only the super user can grant the super_user role' }, 403);
  }

  // Resolve org_id. Super user must pass one; org admin is locked to their own.
  let org_id: string;
  if (isSuperUser(profile)) {
    if (!org_id_input) return json({ error: 'org_id is required for super user' }, 400);
    org_id = org_id_input;
  } else {
    if (!profile.org_id) return json({ error: 'Caller has no organization' }, 403);
    if (org_id_input && org_id_input !== profile.org_id) {
      return json({ error: 'Admins cannot create users in another org' }, 403);
    }
    org_id = profile.org_id;
  }

  if (pin && !isValidPin(pin)) return json({ error: 'PIN must be 4 digits' }, 400);

  // Passwords still required by Supabase Auth. For PIN-only mobile users we
  // mint a strong random one — they'll never use it.
  const effectivePassword = password ?? crypto.randomUUID() + crypto.randomUUID();
  if (effectivePassword.length < 6) {
    return json({ error: 'Password must be at least 6 characters' }, 400);
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: effectivePassword,
    email_confirm: true,
    user_metadata: {
      role, roles: rolesArray, site_id, full_name, org_id, employee_number,
    },
  });
  if (createErr) return json({ error: createErr.message }, 400);

  const userId = created.user!.id;

  const profilePatch: Record<string, unknown> = {
    role, roles: rolesArray,
    site_id, site_ids,
    full_name, phone, email, org_id, employee_number,
  };
  if (pin) {
    profilePatch.pin_hash = await hashPin(pin);
    profilePatch.pin_set_at = new Date().toISOString();
  }
  await admin.from('profiles').update(profilePatch).eq('id', userId);

  await admin.rpc('log_audit_event', {
    _action: 'user.create',
    _actor_id: profile.id,
    _org_id: org_id,
    _target_table: 'profiles',
    _target_id: userId,
    _summary: `${email} created as ${role}`,
    _metadata: { email, role, pin_set: !!pin, employee_number },
  });

  return json({
    id: userId, email, role, roles: rolesArray,
    site_id, full_name, org_id, employee_number,
    pin_set: !!pin,
  }, 201);
});
