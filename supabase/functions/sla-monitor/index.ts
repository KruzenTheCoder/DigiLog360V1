// Scheduled SLA watchdog.
//
// For every breached / update-due occurrence: deliver an Expo push AND
// insert a row in public.notifications so the in-app inbox shows it too.
// Schedule via pg_cron or an external scheduler hitting this endpoint.
import { corsHeaders, json } from '../_shared/cors.ts';
import { renderSystemEmail } from '../_shared/email-templates.ts';
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

  const { data: live, error } = await admin
    .from('occurrences_live')
    .select('id, ob_number, occurrence_type, severity, site_id, org_id, is_sla_breached, is_sla_update_due');
  if (error) return json({ error: error.message }, 500);

  const liveItems = (live ?? []) as Array<{
    id: number; ob_number: string; occurrence_type: string;
    severity: string; site_id: string | null; org_id: string;
    is_sla_breached: boolean; is_sla_update_due: boolean;
  }>;

  const breached = liveItems.filter((o) => o.is_sla_breached);
  const updateDue = liveItems.filter((o) => o.is_sla_update_due && !o.is_sla_breached);

  // Recipients (control_room, supervisor, manager, admin) at affected sites.
  const affectedSites = new Set<string>();
  for (const o of [...breached, ...updateDue]) if (o.site_id) affectedSites.add(o.site_id);

  let pushMessages: unknown[] = [];
  let notificationsInserted = 0;

  let emailsSent = 0;

  // Org names for the email header — one lookup for the run rather than one
  // per recipient.
  const orgNames = new Map<string, string>();
  {
    const ids = [...new Set(liveItems.map((o) => o.org_id).filter(Boolean))];
    if (ids.length > 0) {
      const { data: orgs } = await admin.from('organizations').select('id, name').in('id', ids);
      for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) orgNames.set(o.id, o.name);
    }
  }

  if (affectedSites.size > 0) {
    const { data: recipients } = await admin
      .from('profiles')
      .select('id, full_name, email, expo_push_token, site_id, role, org_id, email_notifications, push_notifications, notify_on_sla_breach')
      .in('site_id', Array.from(affectedSites))
      .in('role', ['control_room', 'supervisor', 'admin', 'manager']);

    type Recipient = {
      id: string; full_name: string | null; email: string | null; expo_push_token: string | null;
      site_id: string | null; role: string; org_id: string;
      email_notifications: boolean | null;
      push_notifications: boolean | null;
      notify_on_sla_breach: boolean | null;
    };

    // Insert in-app notifications (one per recipient per breach/due event,
    // de-duplicated by (user_id, occurrence_id, kind) using upsert semantics).
    const notifRows: Array<{
      org_id: string; user_id: string; kind: string;
      title: string; body: string; data: Record<string, unknown>;
    }> = [];

    for (const r of (recipients ?? []) as Recipient[]) {
      const siteBreached = breached.filter((o) => o.site_id === r.site_id);
      const siteDue = updateDue.filter((o) => o.site_id === r.site_id);
      if (siteBreached.length === 0 && siteDue.length === 0) continue;

      for (const o of siteBreached) {
        notifRows.push({
          org_id: r.org_id, user_id: r.id,
          kind: 'sla.breach',
          title: `SLA breached: ${o.ob_number}`,
          body: `${o.occurrence_type} (${o.severity}) is past its SLA.`,
          data: { occurrence_id: o.id, ob_number: o.ob_number },
        });
      }
      for (const o of siteDue) {
        notifRows.push({
          org_id: r.org_id, user_id: r.id,
          kind: 'sla.update_due',
          title: `Update needed: ${o.ob_number}`,
          body: `${o.occurrence_type} (${o.severity}) needs an SLA update.`,
          data: { occurrence_id: o.id, ob_number: o.ob_number },
        });
      }

      const wantsSla = r.notify_on_sla_breach ?? true;

      if (wantsSla && (r.push_notifications ?? true) && r.expo_push_token) {
        pushMessages.push({
          to: r.expo_push_token,
          sound: 'default',
          title: siteBreached.length > 0 ? 'SLA Breach Alert' : 'SLA Updates Due',
          body:
            (siteBreached.length > 0 ? `${siteBreached.length} occurrence(s) breached SLA. ` : '') +
            (siteDue.length > 0 ? `${siteDue.length} need an update.` : ''),
          data: { type: 'sla', breached: siteBreached.length, due: siteDue.length },
        });
      }

      if (wantsSla && (r.email_notifications ?? true) && r.email && siteBreached.length > 0) {
        try {
          const appUrl = (Deno.env.get('PUBLIC_APP_URL') ?? '').replace(/\/+$/, '');
          // Same shell as every other Digilog360 email — this one fires when
          // something is going wrong, so it should look the most trustworthy,
          // not the least.
          const mail = renderSystemEmail({
            orgName: orgNames.get(r.org_id) ?? 'Digilog360',
            appUrl,
            recipientName: (r.full_name ?? '').split(' ')[0] || null,
            pill: 'SLA BREACH',
            pillColor: '#dc2626',
            headline: `${siteBreached.length} occurrence${siteBreached.length === 1 ? '' : 's'} breached SLA`,
            intro: siteDue.length > 0
              ? `${siteBreached.length} past their deadline, and ${siteDue.length} more need an update before they follow.`
              : 'These are past their response deadline and still open.',
            itemsTitle: 'Breached',
            items: siteBreached.map((o) => ({
              label: o.ob_number ?? `#${o.id}`,
              detail: `${o.occurrence_type}${o.severity ? ` (${o.severity})` : ''}`,
              url: appUrl ? `${appUrl}/occurrences/${o.id}` : null,
            })),
            ctaUrl: appUrl ? `${appUrl}/occurrences` : null,
            ctaLabel: 'Open the live board',
          });
          const apiUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`;
          await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Gateway auth, then the internal key send-email checks itself.
              // Both slots must name the same key — mixing the sb_ anon key
              // with the JWT service key trips "Conflicting API keys" at the
              // gateway and the breach alert never leaves.
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
              apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
              'x-internal-key': Deno.env.get('INTERNAL_FN_KEY') ?? '',
            },
            body: JSON.stringify({
              to: r.email,
              subject: mail.subject,
              html: mail.html,
              text: mail.text,
            }),
          });
          emailsSent += 1;
        } catch (e) {
          console.warn('email failed', e);
        }
      }
    }

    if (notifRows.length > 0) {
      const { error: nErr } = await admin.from('notifications').insert(notifRows);
      if (!nErr) notificationsInserted = notifRows.length;
    }
  }

  await sendExpoPush(pushMessages);

  return json({
    breached: breached.length,
    update_due: updateDue.length,
    notifications_inserted: notificationsInserted,
    push_notifications_sent: pushMessages.length,
    emails_sent: emailsSent,
    checked_at: new Date().toISOString(),
  });
});
