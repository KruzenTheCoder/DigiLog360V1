// Task email alerts — outbox processor, overdue scanner, and test sender.
//
// The database enqueues a row in public.email_outbox for every task event
// (assigned / updated / completed) via triggers. This function drains that
// queue through Resend using each organisation's configuration from
// public.org_email_settings, and scans for overdue tasks (the "breach"
// event), stamping tasks.breach_alerted_at so each task alerts exactly once.
//
// Invocation:
//   • Apps fire-and-forget POST {} after any task mutation → instant emails.
//   • pg_cron POSTs {} every minute (see supabase/schedule_task_alerts.sql)
//     as the reliability sweep — anything the apps missed still goes out,
//     and overdue detection needs no user action at all.
//   • POST { mode: 'test', org_id, event } (super_user only) sends a sample
//     email to the caller using the org's live configuration.
//
// Auth: `x-internal-key` header (cron) OR any signed-in user (flush is
// harmless — all inputs come from the database, never the caller).
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser, isSuperUser } from '../_shared/auth.ts';
import {
  renderTaskEmail, sampleTaskEmailData,
  TASK_EMAIL_EVENTS,
  type TaskEmailEvent, type TaskEmailData, type OrgEmailSettingsRow,
} from '../_shared/email-templates.ts';

const RESEND_URL = 'https://api.resend.com/emails';
const MAX_ATTEMPTS = 5;
const BATCH = 50;

interface TaskRow {
  id: number; org_id: string; title: string; description: string | null;
  priority: string; status: string; due_at: string | null; ob_number: string | null;
  occurrence_id: number | null;
  assigned_to: string | null; assigned_to_name: string | null;
  assigned_by: string | null; assigned_by_name: string | null;
  completion_notes: string | null;
}

interface OccurrenceRow {
  id: number; org_id: string; ob_number: string | null; occurrence_type: string;
  severity: string; status: string; description: string | null;
  sla_due_at: string | null;
  assigned_to: string | null; assigned_to_name: string | null;
  logged_by: string | null; logged_by_name: string | null;
}

interface ProfileRow {
  id: string; email: string | null; full_name: string | null;
  email_notifications: boolean | null; notify_on_assignment: boolean | null;
}

interface OutboxRow {
  id: number; org_id: string; event: string; task_id: number | null;
  occurrence_id: number | null;
  payload: Record<string, unknown>; attempts: number;
}

function humanizeMs(ms: number): string {
  const totalMin = Math.max(1, Math.floor(ms / 60_000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}

/** "Digilog360 <no-reply@x>" + per-org from_name → "Org Name <no-reply@x>" */
function fromHeader(orgFromName: string | null | undefined): string {
  const base = Deno.env.get('EMAIL_FROM') ?? 'Digilog360 <no-reply@digilog360.local>';
  if (!orgFromName?.trim()) return base;
  const addr = base.match(/<([^>]+)>/)?.[1] ?? base;
  return `${orgFromName.trim().replace(/[<>]/g, '')} <${addr}>`;
}

async function sendViaResend(opts: {
  to: string; subject: string; html: string; text: string;
  fromName?: string | null; replyTo?: string | null;
}): Promise<{ ok: boolean; dev?: boolean; error?: string; providerId?: string | null }> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.log('[task-alerts DEV] to=%s subject=%s', opts.to, opts.subject);
    return { ok: true, dev: true, providerId: null };
  }
  const resp = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromHeader(opts.fromName),
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      ...(opts.replyTo?.trim() ? { reply_to: opts.replyTo.trim() } : {}),
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false, error: `Resend ${resp.status}: ${body.slice(0, 300)}` };
  }
  const body = await resp.json().catch(() => ({}));
  return { ok: true, providerId: (body?.id as string | undefined) ?? null };
}

/** Append one row to the delivery ledger (best-effort — never blocks sends). */
async function logDelivery(admin: Sb, entry: {
  org_id: string; outbox_id?: number | null; event: string;
  task_id?: number | null; occurrence_id?: number | null; ob_number?: string | null;
  recipient_id?: string | null; recipient_name?: string | null; recipient_email: string;
  subject: string; status: 'sent' | 'failed' | 'dev';
  provider_id?: string | null; error?: string | null; is_test?: boolean;
}) {
  await admin.from('email_log').insert(entry).then(
    (r: { error: { message: string } | null }) => {
      if (r.error) console.error('email_log insert failed:', r.error.message);
    },
    (e: unknown) => console.error('email_log insert threw:', e),
  );
}

// ─── Config / lookups (cached per invocation) ───────────────────────────────

// deno-lint-ignore no-explicit-any
type Sb = any;

async function loadOrg(admin: Sb, cache: Map<string, { name: string; settings: OrgEmailSettingsRow | null }>, orgId: string) {
  const hit = cache.get(orgId);
  if (hit) return hit;
  const [{ data: org }, { data: settings }] = await Promise.all([
    admin.from('organizations').select('id, name').eq('id', orgId).maybeSingle(),
    admin.from('org_email_settings').select('*').eq('org_id', orgId).maybeSingle(),
  ]);
  const entry = {
    name: (org?.name as string) ?? 'Digilog360',
    settings: (settings as OrgEmailSettingsRow | null) ?? null,
  };
  cache.set(orgId, entry);
  return entry;
}

function eventEnabled(settings: OrgEmailSettingsRow | null, event: TaskEmailEvent): boolean {
  if (settings && settings.enabled === false) return false;
  const cfg = settings?.events?.[event];
  return cfg?.enabled !== false; // default on
}

// ─── Overdue scan ───────────────────────────────────────────────────────────

async function scanOverdue(admin: Sb): Promise<number> {
  const { data: overdue } = await admin
    .from('tasks')
    .select('id, org_id, title, assigned_to, due_at')
    .lt('due_at', new Date().toISOString())
    .is('breach_alerted_at', null)
    .not('status', 'in', '("done","cancelled")')
    .limit(200);

  const rows = (overdue ?? []) as Array<{
    id: number; org_id: string; title: string;
    assigned_to: string | null; due_at: string;
  }>;
  if (rows.length === 0) return 0;

  const ids = rows.map((t) => t.id);
  // Stamp first — even if the send fails, we never spam; retries live in the
  // outbox from here on.
  await admin.from('tasks')
    .update({ breach_alerted_at: new Date().toISOString() })
    .in('id', ids);

  await admin.from('email_outbox').insert(
    rows.map((t) => ({ org_id: t.org_id, event: 'task.overdue', task_id: t.id })),
  );

  // In-app inbox parity for the assignee.
  const notifs = rows
    .filter((t) => t.assigned_to)
    .map((t) => ({
      org_id: t.org_id,
      user_id: t.assigned_to,
      kind: 'task.overdue',
      title: `Task overdue: ${t.title}`,
      body: 'This task has passed its due date and needs attention.',
      data: { task_id: t.id },
    }));
  if (notifs.length > 0) await admin.from('notifications').insert(notifs);

  return rows.length;
}

// ─── Outbox processing ──────────────────────────────────────────────────────

async function processOutbox(admin: Sb) {
  // Recover rows stranded in 'sending' by a crashed run.
  await admin.from('email_outbox')
    .update({ status: 'pending' })
    .eq('status', 'sending')
    .lt('created_at', new Date(Date.now() - 10 * 60_000).toISOString());

  const { data: pending } = await admin
    .from('email_outbox')
    .select('id, org_id, event, task_id, occurrence_id, payload, attempts')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH);

  const rows = (pending ?? []) as OutboxRow[];
  if (rows.length === 0) return { processed: 0, sent: 0, skipped: 0, failed: 0 };

  // Claim — a concurrent invocation that lost the race sees zero claimed rows.
  const { data: claimed } = await admin
    .from('email_outbox')
    .update({ status: 'sending' })
    .in('id', rows.map((r) => r.id))
    .eq('status', 'pending')
    .select('id');
  const claimedIds = new Set(((claimed ?? []) as Array<{ id: number }>).map((c) => c.id));

  const orgCache = new Map<string, { name: string; settings: OrgEmailSettingsRow | null }>();
  const appUrl = Deno.env.get('PUBLIC_APP_URL') ?? '';
  let sent = 0, skipped = 0, failed = 0;
  // Collapse duplicates within one run (rapid consecutive edits).
  const delivered = new Set<string>();

  for (const row of rows) {
    if (!claimedIds.has(row.id)) continue;
    const finish = (status: string, error?: string) =>
      admin.from('email_outbox').update({
        status,
        attempts: row.attempts + 1,
        last_error: error ?? null,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
      }).eq('id', row.id);

    try {
      const event = row.event as TaskEmailEvent;
      const isOccurrenceEvent = event.startsWith('occurrence.');
      if (!TASK_EMAIL_EVENTS.includes(event)
          || (isOccurrenceEvent ? !row.occurrence_id : !row.task_id)) {
        await finish('skipped', 'Unknown event or missing record'); skipped++; continue;
      }

      const { name: orgName, settings } = await loadOrg(admin, orgCache, row.org_id);
      if (!eventEnabled(settings, event)) {
        await finish('skipped', 'Disabled in org settings'); skipped++; continue;
      }

      let t: TaskRow | null = null;
      let occ: OccurrenceRow | null = null;
      if (isOccurrenceEvent) {
        const { data } = await admin.from('occurrences')
          .select('id, org_id, ob_number, occurrence_type, severity, status, description, sla_due_at, assigned_to, assigned_to_name, logged_by, logged_by_name')
          .eq('id', row.occurrence_id).maybeSingle();
        occ = (data as OccurrenceRow | null);
        if (!occ) { await finish('skipped', 'Occurrence no longer exists'); skipped++; continue; }
      } else {
        const { data } = await admin.from('tasks')
          .select('id, org_id, title, description, priority, status, due_at, ob_number, occurrence_id, assigned_to, assigned_to_name, assigned_by, assigned_by_name, completion_notes')
          .eq('id', row.task_id).maybeSingle();
        t = (data as TaskRow | null);
        if (!t) { await finish('skipped', 'Task no longer exists'); skipped++; continue; }
      }

      // Resolve recipient ids per event. Assignment events ALWAYS include the
      // assignee — even when they assigned it to themselves, the email is the
      // record. Only updated/completed exclude the actor.
      const actorId = (row.payload?.actor_id as string | undefined) ?? null;
      const recipientIds = new Set<string>();
      if (event === 'occurrence.updated') {
        // The reviewer it's assigned to, plus whoever logged it — minus the
        // person who just made the change.
        if (occ!.assigned_to) recipientIds.add(occ!.assigned_to);
        if (occ!.logged_by) recipientIds.add(occ!.logged_by);
        if (actorId) recipientIds.delete(actorId);
      } else if (isOccurrenceEvent) {
        if (occ!.assigned_to) recipientIds.add(occ!.assigned_to);
      } else if (event === 'task.assigned') {
        if (t!.assigned_to) recipientIds.add(t!.assigned_to);
      } else {
        if (t!.assigned_to) recipientIds.add(t!.assigned_to);
        if (t!.assigned_by) recipientIds.add(t!.assigned_by);
        if (event === 'task.overdue' && settings?.notify_admins_on_breach) {
          const { data: admins } = await admin.from('profiles')
            .select('id').eq('org_id', row.org_id).eq('role', 'admin')
            .is('deleted_at', null);
          for (const a of (admins ?? []) as Array<{ id: string }>) recipientIds.add(a.id);
        }
        if (actorId && event !== 'task.overdue') recipientIds.delete(actorId);
      }

      if (recipientIds.size === 0) { await finish('skipped', 'No recipients'); skipped++; continue; }

      const { data: profiles } = await admin.from('profiles')
        .select('id, email, full_name, email_notifications, notify_on_assignment')
        .in('id', Array.from(recipientIds));

      // Actor display name for the intro line.
      let actorName = (row.payload?.actor_name as string | undefined) ?? null;
      if (!actorName && actorId) {
        const { data: actor } = await admin.from('profiles')
          .select('full_name').eq('id', actorId).maybeSingle();
        actorName = (actor?.full_name as string | undefined) ?? null;
      }

      const overdueBy = event === 'task.overdue' && t?.due_at
        ? humanizeMs(Date.now() - new Date(t.due_at).getTime())
        : null;

      let delivering = 0;
      const errors: string[] = [];
      for (const p of (profiles ?? []) as ProfileRow[]) {
        if (!p.email) continue;
        if (p.email_notifications === false) continue;
        const isAssignment = event === 'task.assigned' || event === 'occurrence.assigned';
        if (isAssignment && p.notify_on_assignment === false) continue;
        // Cross-event dedupe: logging an occurrence with an assignee enqueues
        // BOTH occurrence.assigned and task.assigned (for the auto-created
        // "Investigate" task). Scope assignment emails to the occurrence so
        // the reviewer gets exactly one. Updates dedupe per record instead, so
        // a status change and its note collapse into a single email.
        const dedupeKey = isAssignment
          ? `assigned:${p.id}:${isOccurrenceEvent ? `occ${occ!.id}` : (t!.occurrence_id ? `occ${t!.occurrence_id}` : `task${t!.id}`)}`
          : isOccurrenceEvent
            ? `occ${occ!.id}:${event}:${p.id}`
            : `${row.task_id}:${event}:${p.id}`;
        if (delivered.has(dedupeKey)) continue;

        const data: TaskEmailData = isOccurrenceEvent
          ? {
              taskId: occ!.id,
              urlPath: 'occurrences',
              occurrenceId: occ!.id,
              title: occ!.occurrence_type,
              description: occ!.description,
              priority: occ!.severity,
              status: occ!.status,
              dueAt: occ!.sla_due_at,
              obNumber: occ!.ob_number,
              assigneeName: occ!.assigned_to_name,
              // On updates the "assigned by" row would mislabel the actor, and
              // the intro already names them — omit it there.
              assignedByName: event === 'occurrence.updated' ? null : actorName,
              actorName,
              notes: (row.payload?.notes as string | undefined) ?? null,
              orgName,
              appUrl,
              recipientName: p.full_name?.split(' ')[0] ?? null,
            }
          : {
              taskId: t!.id,
              occurrenceId: t!.occurrence_id,
              title: t!.title,
              description: t!.description,
              priority: t!.priority,
              status: t!.status,
              dueAt: t!.due_at,
              obNumber: t!.ob_number,
              assigneeName: t!.assigned_to_name,
              assignedByName: t!.assigned_by_name,
              actorName,
              notes: (row.payload?.notes as string | undefined) ?? null,
              completionNotes: t!.completion_notes,
              orgName,
              appUrl,
              recipientName: p.full_name?.split(' ')[0] ?? null,
              overdueBy,
            };
        const { subject, html, text } = renderTaskEmail(event, data, settings);
        const res = await sendViaResend({
          to: p.email, subject, html, text,
          fromName: settings?.from_name, replyTo: settings?.reply_to,
        });
        await logDelivery(admin, {
          org_id: row.org_id,
          outbox_id: row.id,
          event,
          task_id: t?.id ?? null,
          occurrence_id: isOccurrenceEvent ? occ!.id : (t?.occurrence_id ?? null),
          ob_number: (isOccurrenceEvent ? occ!.ob_number : t!.ob_number) ?? null,
          recipient_id: p.id,
          recipient_name: p.full_name,
          recipient_email: p.email,
          subject,
          status: res.ok ? (res.dev ? 'dev' : 'sent') : 'failed',
          provider_id: res.providerId ?? null,
          error: res.ok ? null : (res.error ?? 'send failed'),
        });
        if (res.ok) { delivering++; delivered.add(dedupeKey); }
        else errors.push(res.error ?? 'send failed');
      }

      if (errors.length > 0 && delivering === 0) {
        // Total failure → retry later (back to pending until MAX_ATTEMPTS).
        const retryable = row.attempts + 1 < MAX_ATTEMPTS;
        await finish(retryable ? 'pending' : 'failed', errors.join(' | '));
        failed++;
      } else if (delivering === 0) {
        await finish('skipped', 'All recipients deduplicated, opted out, or lack email'); skipped++;
      } else {
        await finish('sent', errors.length > 0 ? errors.join(' | ') : undefined); sent++;
      }
    } catch (e) {
      await finish(row.attempts + 1 < MAX_ATTEMPTS ? 'pending' : 'failed', String(e).slice(0, 400));
      failed++;
    }
  }

  return { processed: rows.length, sent, skipped, failed };
}

// ─── Entry point ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = serviceClient();
  // Internal callers: the x-internal-key header (other functions) OR the
  // project's service key as bearer (pg_cron, matching the sla-monitor
  // pattern). Projects may run legacy JWT keys, new sb_secret_ keys, or both,
  // so accept: exact env match, membership in SUPABASE_SECRET_KEYS, or a JWT
  // whose role claim is service_role (the platform's verify_jwt gate has
  // already checked the signature before this code runs). Worst case if
  // spoofed: an outbox flush that cron would run within a minute anyway —
  // test mode below still demands a real super-user session.
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const bearerIsServiceKey = (() => {
    if (!bearer) return false;
    if (bearer === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true;
    if (bearer.startsWith('sb_secret_')
        && (Deno.env.get('SUPABASE_SECRET_KEYS') ?? '').includes(bearer)) return true;
    const parts = bearer.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload?.role === 'service_role') return true;
      } catch { /* not a JWT */ }
    }
    return false;
  })();
  const internal =
    (!!Deno.env.get('INTERNAL_FN_KEY')
      && req.headers.get('x-internal-key') === Deno.env.get('INTERNAL_FN_KEY'))
    || bearerIsServiceKey;

  let caller: Awaited<ReturnType<typeof requireUser>> | null = null;
  if (!internal) {
    caller = await requireUser(req, admin);
    if (caller.error) return json({ error: caller.error }, 401);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  // ── Test mode: render + send a sample email to the caller (super only) ──
  //
  // Deliberately NOT subject-tagged. Nothing this platform sends should carry
  // a "test" marker, so a preview is byte-identical to the real thing — which
  // is the point of a preview. The distinction is kept in the ledger via
  // email_log.is_test, not in the recipient's inbox. Note the consequence: a
  // preview is indistinguishable from a live alert once delivered, so send
  // them to your own address.
  if (body.mode === 'test') {
    if (internal || !caller || !isSuperUser(caller.profile)) {
      return json({ error: 'Test sends are super-user only' }, 403);
    }
    // Optional explicit test recipient; falls back to the caller's own email.
    const toOverride = typeof body.to === 'string'
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to.trim())
      ? body.to.trim() : null;
    const to = toOverride ?? caller.profile?.email ?? caller.user?.email;
    if (!to) return json({ error: 'No recipient — provide "to" or set an email on your profile' }, 400);

    const event = String(body.event ?? 'task.assigned') as TaskEmailEvent;
    if (!TASK_EMAIL_EVENTS.includes(event)) return json({ error: 'Unknown event' }, 400);

    const orgId = String(body.org_id ?? '');
    const cache = new Map<string, { name: string; settings: OrgEmailSettingsRow | null }>();
    const { name: orgName, settings } = orgId
      ? await loadOrg(admin, cache, orgId)
      : { name: 'Digilog360', settings: null };

    const data = sampleTaskEmailData(orgName, Deno.env.get('PUBLIC_APP_URL'));
    data.recipientName = caller.profile?.full_name?.split(' ')[0] ?? null;
    if (event === 'task.completed') data.status = 'done';
    if (event.startsWith('occurrence.')) {
      data.title = 'Perimeter Intrusion';
      data.priority = 'critical';
      data.urlPath = 'occurrences';
      data.taskId = data.occurrenceId ?? data.taskId;
      if (event === 'occurrence.assigned') {
        data.status = 'open';
        data.notes = null;
      } else {
        data.status = 'in_progress';
        data.notes = 'Armed response on scene, perimeter secured. Awaiting SAPS case number.';
      }
    }
    const { subject, html, text } = renderTaskEmail(event, data, settings);
    const res = await sendViaResend({
      to, subject, html, text,
      fromName: settings?.from_name, replyTo: settings?.reply_to,
    });
    if (orgId) {
      await logDelivery(admin, {
        org_id: orgId,
        event,
        recipient_id: caller.profile?.id ?? null,
        recipient_name: caller.profile?.full_name ?? null,
        recipient_email: to,
        subject,
        status: res.ok ? (res.dev ? 'dev' : 'sent') : 'failed',
        provider_id: res.providerId ?? null,
        error: res.ok ? null : (res.error ?? 'send failed'),
        is_test: true,
      });
    }
    if (!res.ok) return json({ error: res.error }, 502);
    return json({ ok: true, to, dev: res.dev ?? false });
  }

  // ── Default: overdue scan + drain the outbox ──
  const overdueEnqueued = await scanOverdue(admin);
  const result = await processOutbox(admin);

  return json({ ok: true, overdue_enqueued: overdueEnqueued, ...result, checked_at: new Date().toISOString() });
});
