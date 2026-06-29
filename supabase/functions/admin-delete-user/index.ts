// Delete a user — removes the auth account, which cascade-deletes the profile
// (profiles.id references auth.users(id) on delete cascade).
//
// Authorization:
//   • super_user — may delete any user except themselves.
//   • admin      — may delete users in their OWN org, except super_users and
//                  except themselves.
//
// Body: { user_id }
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, isSuperUser } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);
  const caller = result.profile;
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

  const userId = String(body.user_id ?? '').trim();
  if (!userId) return json({ error: 'user_id is required' }, 400);
  if (userId === caller.id) return json({ error: 'You cannot delete your own account.' }, 400);

  const { data: target } = await admin
    .from('profiles').select('id, role, org_id, email').eq('id', userId).maybeSingle();
  if (!target) return json({ error: 'User not found' }, 404);

  if (!isSuperUser(caller)) {
    if (target.org_id !== caller.org_id) {
      return json({ error: 'Cannot delete users in another organization.' }, 403);
    }
    if (target.role === 'super_user') {
      return json({ error: 'Cannot delete a super user.' }, 403);
    }
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return json({ error: delErr.message }, 400);

  try {
    await admin.rpc('log_audit_event', {
      _action: 'user.delete',
      _actor_id: caller.id,
      _org_id: target.org_id,
      _target_table: 'profiles',
      _target_id: userId,
      _summary: `${target.email ?? userId} deleted`,
      _metadata: { role: target.role },
    });
  } catch { /* non-fatal */ }

  return json({ ok: true, user_id: userId }, 200);
});
