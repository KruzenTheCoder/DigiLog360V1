// Super-user-only: mutate the role × capability matrix for an organisation.
//
// Body modes:
//   { mode: 'grant',  org_id, role, capability_key }
//   { mode: 'revoke', org_id, role, capability_key }
//   { mode: 'bulk',   org_id, role, capability_keys: string[], action: 'grant'|'revoke' }
//   { mode: 'add_capability', key, area, label, description? }
//   { mode: 'remove_capability', key }                  // non-system only
//
// Every mutation writes an audit row so we can trace permission drift.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, isSuperUser, type AppRole } from '../_shared/auth.ts';

const ROLES: AppRole[] = ['super_user', 'admin', 'manager', 'control_room', 'supervisor', 'guard'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);
  if (!isSuperUser(result.profile)) return json({ error: 'Super user required' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const mode = String(body.mode ?? '');

  // ---------- single grant / revoke ----------
  if (mode === 'grant' || mode === 'revoke') {
    const org_id = String(body.org_id ?? '');
    const role = String(body.role ?? '') as AppRole;
    const capability_key = String(body.capability_key ?? '');
    if (!org_id || !role || !capability_key) {
      return json({ error: 'org_id, role and capability_key required' }, 400);
    }
    if (!ROLES.includes(role)) return json({ error: 'Invalid role' }, 400);

    if (mode === 'grant') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin as any).from('role_capabilities').insert({
        org_id, role, capability_key, granted_by: result.profile?.id,
      });
      if (error && !error.message.includes('duplicate')) {
        return json({ error: error.message }, 400);
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin as any).from('role_capabilities').delete()
        .eq('org_id', org_id).eq('role', role).eq('capability_key', capability_key);
      if (error) return json({ error: error.message }, 400);
    }

    await admin.rpc('log_audit_event', {
      _action: `capability.${mode}`,
      _actor_id: result.profile?.id,
      _org_id: org_id,
      _target_table: 'role_capabilities',
      _target_id: `${role}:${capability_key}`,
      _summary: `${mode === 'grant' ? 'Granted' : 'Revoked'} ${capability_key} for ${role}`,
    }).catch(() => {});

    return json({ ok: true });
  }

  // ---------- bulk grant / revoke ----------
  if (mode === 'bulk') {
    const org_id = String(body.org_id ?? '');
    const role = String(body.role ?? '') as AppRole;
    const action = String(body.action ?? '');
    const keys = Array.isArray(body.capability_keys) ? body.capability_keys.map(String) : [];
    if (!org_id || !role || !action || keys.length === 0) {
      return json({ error: 'org_id, role, action and capability_keys required' }, 400);
    }
    if (!ROLES.includes(role)) return json({ error: 'Invalid role' }, 400);

    if (action === 'grant') {
      const rows = keys.map((k) => ({
        org_id, role, capability_key: k, granted_by: result.profile?.id,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin as any).from('role_capabilities').upsert(rows, {
        onConflict: 'org_id,role,capability_key', ignoreDuplicates: true,
      });
      if (error) return json({ error: error.message }, 400);
    } else if (action === 'revoke') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (admin as any).from('role_capabilities').delete()
        .eq('org_id', org_id).eq('role', role).in('capability_key', keys);
      if (error) return json({ error: error.message }, 400);
    } else {
      return json({ error: 'Invalid action' }, 400);
    }

    await admin.rpc('log_audit_event', {
      _action: `capability.bulk_${action}`,
      _actor_id: result.profile?.id,
      _org_id: org_id,
      _target_table: 'role_capabilities',
      _target_id: role,
      _summary: `${action === 'grant' ? 'Granted' : 'Revoked'} ${keys.length} capabilities for ${role}`,
      _metadata: { keys } as unknown as Record<string, unknown>,
    }).catch(() => {});

    return json({ ok: true, affected: keys.length });
  }

  // ---------- catalog management ----------
  if (mode === 'add_capability') {
    const key = String(body.key ?? '').trim();
    const area = String(body.area ?? '').trim();
    const label = String(body.label ?? '').trim();
    const description = body.description ? String(body.description) : null;
    if (!key || !area || !label) return json({ error: 'key, area and label required' }, 400);
    if (!/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(key)) {
      return json({ error: 'key must be lower.snake.dotted, e.g. occurrences.delete' }, 400);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from('capabilities').insert({
      key, area, label, description, is_system: false,
    });
    if (error) return json({ error: error.message }, 400);

    await admin.rpc('log_audit_event', {
      _action: 'capability.add',
      _actor_id: result.profile?.id,
      _target_table: 'capabilities',
      _target_id: key,
      _summary: `Created custom capability ${key}`,
    }).catch(() => {});

    return json({ ok: true, key });
  }

  if (mode === 'remove_capability') {
    const key = String(body.key ?? '').trim();
    if (!key) return json({ error: 'key required' }, 400);

    // Block deleting system caps to prevent footguns.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cap } = await (admin as any).from('capabilities').select('is_system').eq('key', key).maybeSingle();
    if (!cap) return json({ error: 'Capability not found' }, 404);
    if (cap.is_system) return json({ error: 'Cannot delete a built-in capability' }, 400);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from('capabilities').delete().eq('key', key);
    if (error) return json({ error: error.message }, 400);

    await admin.rpc('log_audit_event', {
      _action: 'capability.remove',
      _actor_id: result.profile?.id,
      _target_table: 'capabilities',
      _target_id: key,
      _summary: `Removed custom capability ${key}`,
    }).catch(() => {});

    return json({ ok: true });
  }

  return json({ error: 'Invalid mode' }, 400);
});
