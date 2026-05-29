// Update a user: role, site, name, phone, password reset, activate/deactivate. Admin only.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, requireRole, AppRole } from '../_shared/auth.ts';

const VALID_ROLES: AppRole[] = ['admin', 'control_room', 'supervisor', 'guard'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const { profile, error } = await requireUser(req, admin);
  if (error) return json({ error }, 401);
  if (!requireRole(profile, ['admin'])) return json({ error: 'Admin role required' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const userId = String(body.user_id ?? '');
  if (!userId) return json({ error: 'user_id is required' }, 400);

  const profilePatch: Record<string, unknown> = {};
  const authPatch: Record<string, unknown> = {};

  if (body.role !== undefined) {
    const role = String(body.role) as AppRole;
    if (!VALID_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400);
    profilePatch.role = role;
  }
  if (body.site_id !== undefined) profilePatch.site_id = body.site_id ? String(body.site_id) : null;
  if (body.full_name !== undefined) profilePatch.full_name = body.full_name ? String(body.full_name) : null;
  if (body.phone !== undefined) profilePatch.phone = body.phone ? String(body.phone) : null;
  if (body.is_active !== undefined) profilePatch.is_active = Boolean(body.is_active);

  if (body.password !== undefined) {
    const pw = String(body.password);
    if (pw.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
    authPatch.password = pw;
  }
  // Deactivating bans sign-in; reactivating clears the ban.
  if (body.is_active !== undefined) {
    authPatch.ban_duration = body.is_active ? 'none' : '876000h';
  }

  if (Object.keys(authPatch).length > 0) {
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, authPatch);
    if (authErr) return json({ error: authErr.message }, 400);
  }
  if (Object.keys(profilePatch).length > 0) {
    const { error: profErr } = await admin.from('profiles').update(profilePatch).eq('id', userId);
    if (profErr) return json({ error: profErr.message }, 400);
  }

  return json({ id: userId, ...profilePatch });
});
