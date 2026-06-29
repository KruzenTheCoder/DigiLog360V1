// Super-user-only: permanently delete an organization and everything in it.
//
// Deleting the organizations row cascades all domain data (sites, occurrences,
// profiles, settings, …) via the `org_id ... on delete cascade` FKs. The auth
// users themselves are NOT reachable by that cascade, so we collect the org's
// member ids first and delete their auth accounts explicitly — otherwise every
// deleted org would leave orphaned auth.users entries behind (and their emails
// could never be reused).
//
// Body: { org_id }
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, isSuperUser } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);
  if (!isSuperUser(result.profile)) return json({ error: 'Super user required' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const orgId = String(body.org_id ?? '').trim();
  if (!orgId) return json({ error: 'org_id is required' }, 400);

  // Safety: never let a super_user delete the org they belong to — that would
  // cascade-delete their own profile/account mid-request.
  if (result.profile!.org_id === orgId) {
    return json({ error: 'You cannot delete your own organization.' }, 400);
  }

  // Capture the org's auth users BEFORE the cascade removes their profiles.
  const { data: members } = await admin
    .from('profiles').select('id').eq('org_id', orgId);
  const memberIds = ((members ?? []) as { id: string }[]).map((m) => m.id);

  // Delete the org → cascades all org-scoped domain data.
  const { error: delErr } = await admin.from('organizations').delete().eq('id', orgId);
  if (delErr) return json({ error: delErr.message }, 400);

  // Remove the now-orphaned auth accounts (their profiles are already gone).
  let usersRemoved = 0;
  for (const id of memberIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (!error) usersRemoved++;
  }

  // Best-effort audit. The org is gone, so log against the actor's own org.
  try {
    await admin.rpc('log_audit_event', {
      _action: 'org.delete',
      _actor_id: result.profile!.id,
      _org_id: result.profile!.org_id,
      _target_table: 'organizations',
      _target_id: orgId,
      _summary: `Organization deleted (${usersRemoved} user account(s) removed)`,
      _metadata: { org_id: orgId, users_removed: usersRemoved },
    });
  } catch { /* non-fatal */ }

  return json({ ok: true, org_id: orgId, users_removed: usersRemoved }, 200);
});
