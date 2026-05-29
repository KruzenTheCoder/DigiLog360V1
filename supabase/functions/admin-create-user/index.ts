// Creates an auth user + profile. Admin only. Replaces the legacy Admin/CreateUser.
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

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const role = String(body.role ?? 'guard') as AppRole;
  const full_name = body.full_name ? String(body.full_name) : null;
  const site_id = body.site_id ? String(body.site_id) : null;
  const phone = body.phone ? String(body.phone) : null;

  if (!email || !password) return json({ error: 'Email and password are required' }, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);
  if (!VALID_ROLES.includes(role)) return json({ error: 'Invalid role' }, 400);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, site_id, full_name },
  });
  if (createErr) return json({ error: createErr.message }, 400);

  // Ensure the profile matches (the trigger also fills it, this guarantees fields).
  const userId = created.user!.id;
  await admin.from('profiles').update({
    role, site_id, full_name, phone, email,
  }).eq('id', userId);

  return json({ id: userId, email, role, site_id, full_name }, 201);
});
