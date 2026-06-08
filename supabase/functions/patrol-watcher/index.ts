// Scheduled patrol watchdog.
//
// 1. Generates expected_patrols slots for the next 6 hours.
// 2. Finds expected_patrols that are now overdue (past due + grace), still
//    unsatisfied, and have not yet emitted a late_alert.
// 3. For each, inserts a notification + push for the on-duty supervisors at
//    the affected site.
//
// Schedule via pg_cron every 5 minutes:
//   select cron.schedule('patrol-watcher','*/5 * * * *',
//     $$ select net.http_post(
//       url := 'https://<ref>.functions.supabase.co/patrol-watcher',
//       headers := jsonb_build_object('Authorization','Bearer <service-role>')
//     ) $$);
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/auth.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = serviceClient();

  // 1. seed upcoming expected_patrols
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).rpc('generate_expected_patrols', { _horizon_hours: 6 }).catch(() => {});

  // 2. find overdue, unsatisfied, unalerted
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min grace default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overdue } = await (admin as any)
    .from('expected_patrols')
    .select('id, org_id, route_id, site_id, due_at')
    .is('satisfied_at', null)
    .is('late_alert_sent_at', null)
    .lte('due_at', cutoff)
    .limit(200);

  const items = (overdue ?? []) as Array<{
    id: number; org_id: string; route_id: string;
    site_id: string | null; due_at: string;
  }>;
  if (items.length === 0) {
    return json({ ok: true, overdue: 0 });
  }

  // 3. recipients: supervisors + control room at each affected site
  const sites = Array.from(new Set(items.map((i) => i.site_id).filter(Boolean) as string[]));
  const { data: recipients } = await admin
    .from('profiles')
    .select('id, email, site_id, expo_push_token, org_id, push_notifications, email_notifications')
    .in('site_id', sites)
    .in('role', ['supervisor', 'control_room', 'manager', 'admin']);

  type Recip = {
    id: string; email: string | null; site_id: string | null;
    expo_push_token: string | null; org_id: string;
    push_notifications: boolean | null; email_notifications: boolean | null;
  };

  const pushMessages: unknown[] = [];
  const notifRows: Array<{ org_id: string; user_id: string; kind: string; title: string; body: string; data: unknown }> = [];

  for (const r of (recipients ?? []) as Recip[]) {
    const siteItems = items.filter((i) => i.site_id === r.site_id);
    if (siteItems.length === 0) continue;
    notifRows.push({
      org_id: r.org_id, user_id: r.id,
      kind: 'patrol.late',
      title: `${siteItems.length} patrol(s) overdue`,
      body: `Schedule missed by ${Math.round((Date.now() - new Date(siteItems[0].due_at).getTime()) / 60000)} min.`,
      data: { expected_ids: siteItems.map((i) => i.id) },
    });
    if (r.push_notifications !== false && r.expo_push_token) {
      pushMessages.push({
        to: r.expo_push_token,
        sound: 'default',
        title: 'Patrol overdue',
        body: `${siteItems.length} scheduled patrol(s) have not started.`,
        data: { type: 'patrol_late', count: siteItems.length },
      });
    }
  }

  if (notifRows.length > 0) {
    await admin.from('notifications').insert(notifRows);
  }
  if (pushMessages.length > 0) {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(pushMessages),
    }).catch(() => {});
  }

  // 4. mark them as alerted so we don't spam
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('expected_patrols')
    .update({ late_alert_sent_at: new Date().toISOString() })
    .in('id', items.map((i) => i.id));

  return json({
    ok: true,
    overdue: items.length,
    push_sent: pushMessages.length,
    notifications: notifRows.length,
  });
});
