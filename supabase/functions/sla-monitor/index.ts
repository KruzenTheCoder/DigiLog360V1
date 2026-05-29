// Scheduled SLA watchdog: finds breached / update-due occurrences and pushes
// alerts to control-room + supervisor staff at the affected site (Expo push).
// Schedule via pg_cron or an external scheduler hitting this endpoint.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/auth.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendExpoPush(messages: unknown[]) {
  if (messages.length === 0) return;
  await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = serviceClient();

  // occurrences_live already exposes computed SLA flags.
  const { data: live, error } = await admin
    .from('occurrences_live')
    .select('ob_number, occurrence_type, severity, site_id, is_sla_breached, is_sla_update_due');
  if (error) return json({ error: error.message }, 500);

  const breached = (live ?? []).filter((o) => o.is_sla_breached);
  const updateDue = (live ?? []).filter((o) => o.is_sla_update_due && !o.is_sla_breached);

  // Group affected sites → notify their control room / supervisors.
  const affectedSites = new Set<string>();
  for (const o of [...breached, ...updateDue]) if (o.site_id) affectedSites.add(o.site_id);

  const messages: unknown[] = [];
  if (affectedSites.size > 0) {
    const { data: recipients } = await admin
      .from('profiles')
      .select('expo_push_token, site_id, role')
      .in('site_id', Array.from(affectedSites))
      .in('role', ['control_room', 'supervisor', 'admin'])
      .not('expo_push_token', 'is', null);

    for (const r of recipients ?? []) {
      const siteBreached = breached.filter((o) => o.site_id === r.site_id).length;
      const siteDue = updateDue.filter((o) => o.site_id === r.site_id).length;
      if (siteBreached === 0 && siteDue === 0) continue;
      messages.push({
        to: r.expo_push_token,
        sound: 'default',
        title: siteBreached > 0 ? 'SLA Breach Alert' : 'SLA Updates Due',
        body:
          (siteBreached > 0 ? `${siteBreached} occurrence(s) breached SLA. ` : '') +
          (siteDue > 0 ? `${siteDue} need an update.` : ''),
        data: { type: 'sla', breached: siteBreached, due: siteDue },
      });
    }
  }

  await sendExpoPush(messages);

  return json({
    breached: breached.length,
    update_due: updateDue.length,
    notifications_sent: messages.length,
    checked_at: new Date().toISOString(),
  });
});
