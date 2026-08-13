// ============================================================================
// Task email alerts — types, per-org configuration shape, and the canonical
// HTML template renderer.
//
// This module is intentionally SELF-CONTAINED (no imports) because the
// `task-alerts` edge function runs on Deno and cannot import the workspace
// package. The file `supabase/functions/_shared/email-templates.ts` is a
// byte-for-byte copy of this one — if you change anything here, copy the
// change there too (a comment at the top of that file says the same).
//
// The admin's Super User → Email Alerts page imports this module directly for
// its live preview, so what the super user sees in the preview iframe is
// exactly what Resend delivers.
// ============================================================================

export const TASK_EMAIL_EVENTS = [
  'task.assigned',
  'occurrence.assigned',
  'task.updated',
  'occurrence.updated',
  'task.completed',
  'task.overdue',
] as const;

export type TaskEmailEvent = (typeof TASK_EMAIL_EVENTS)[number];

export interface EmailEventConfig {
  /** Undefined = enabled (default-on). */
  enabled?: boolean;
  /** Subject template. Supports {{variables}} — see EMAIL_TEMPLATE_VARS. */
  subject?: string;
  /** Intro paragraph template shown under the headline. */
  intro?: string;
}

/** Shape of public.org_email_settings (one row per organisation). */
export interface OrgEmailSettingsRow {
  org_id: string;
  enabled: boolean;
  from_name: string | null;
  reply_to: string | null;
  accent_color: string | null;
  footer_note: string | null;
  notify_admins_on_breach: boolean;
  events: Partial<Record<TaskEmailEvent, EmailEventConfig>>;
  updated_at?: string;
  updated_by?: string | null;
}

export const DEFAULT_EMAIL_SETTINGS: Omit<OrgEmailSettingsRow, 'org_id'> = {
  enabled: true,
  from_name: null,
  reply_to: null,
  accent_color: null,
  footer_note: null,
  notify_admins_on_breach: false,
  events: {},
};

export const TASK_EMAIL_EVENT_META: Record<
  TaskEmailEvent,
  { label: string; description: string; pill: string; color: string }
> = {
  'task.assigned': {
    label: 'Task assigned',
    description: 'Sent to the assignee the moment a task is created for them or reassigned to them — including tasks they assign to themselves.',
    pill: 'NEW ASSIGNMENT',
    color: '#667eea',
  },
  'occurrence.assigned': {
    label: 'Occurrence assigned',
    description: 'Sent to the reviewer whenever an occurrence (OB) is assigned to them — from the log form, the occurrence detail page, or a bulk action.',
    pill: 'OCCURRENCE ASSIGNED',
    color: '#7c3aed',
  },
  'task.updated': {
    label: 'Task updated',
    description: 'Sent to the assigner and assignee (except the person who made the change) when the status changes or a note is posted.',
    pill: 'TASK UPDATED',
    color: '#0ea5e9',
  },
  'occurrence.updated': {
    label: 'Occurrence updated',
    description: 'Sent to the assigned reviewer and the person who logged it whenever an assigned occurrence changes status or gets a new note — including when it is resolved or closed. Only assigned occurrences trigger this.',
    pill: 'OCCURRENCE UPDATED',
    color: '#0891b2',
  },
  'task.completed': {
    label: 'Task completed',
    description: 'Sent to the assigner (and assignee, if someone else completed it) when a task is marked done.',
    pill: 'TASK COMPLETED',
    color: '#16a34a',
  },
  'task.overdue': {
    label: 'Task overdue (breach)',
    description: 'Sent once when a task passes its due date without being completed. Optionally copies org admins.',
    pill: 'TASK OVERDUE',
    color: '#dc2626',
  },
};

export const DEFAULT_EMAIL_SUBJECTS: Record<TaskEmailEvent, string> = {
  'task.assigned': 'New task for you: {{task_title}}',
  'occurrence.assigned': 'Occurrence assigned to you: {{ob_number}} — {{task_title}}',
  'task.updated': 'Task updated: {{task_title}}',
  'occurrence.updated': '{{ob_number}} is now {{task_status}} — {{task_title}}',
  'task.completed': 'Task completed: {{task_title}}',
  'task.overdue': 'Overdue task: {{task_title}}',
};

export const DEFAULT_EMAIL_INTROS: Record<TaskEmailEvent, string> = {
  'task.assigned':
    '{{assigned_by_name}} assigned a task to you in {{org_name}}. The details are below — open it in Digilog360 to accept and track it.',
  'occurrence.assigned':
    '{{actor_name}} assigned occurrence {{ob_number}} to you for review in {{org_name}}. The details are below.',
  'task.updated':
    '{{actor_name}} posted an update on a task you are involved in. The latest state is below.',
  'occurrence.updated':
    '{{actor_name}} updated occurrence {{ob_number}}, which is assigned to {{assignee_name}}. It is now {{task_status}} — the latest state and notes are below.',
  'task.completed':
    'Good news — the task below has just been marked as {{task_status}} by {{actor_name}}.',
  'task.overdue':
    'This task has passed its due date without being completed. It needs attention now.',
};

/** Variables usable in subject + intro templates (shown as chips in the UI). */
export const EMAIL_TEMPLATE_VARS = [
  'task_title',
  'task_priority',
  'task_status',
  'due_date',
  'ob_number',
  'assignee_name',
  'assigned_by_name',
  'actor_name',
  'org_name',
  'overdue_by',
] as const;

/** Everything the renderer needs to build one email. */
export interface TaskEmailData {
  taskId: number | string;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  dueAt?: string | null;
  obNumber?: string | null;
  assigneeName?: string | null;
  assignedByName?: string | null;
  actorName?: string | null;
  /** Latest timeline note, if any — quoted in updated/completed emails. */
  notes?: string | null;
  completionNotes?: string | null;
  orgName: string;
  /** Base URL of the admin console (no trailing slash). */
  appUrl?: string | null;
  /** Path segment for the CTA link: 'tasks' (default) or 'occurrences'. */
  urlPath?: 'tasks' | 'occurrences';
  /**
   * Linked occurrence id. On task emails this adds a second link straight to
   * the occurrence behind the task, so the OB is always one click away.
   */
  occurrenceId?: number | string | null;
  recipientName?: string | null;
  /** Human-friendly “overdue by 3 h” string (overdue event only). */
  overdueBy?: string | null;
}

// ─── Self-contained label/colour maps (mirrors @digilog/shared constants) ───

// Covers both task priorities and occurrence severities.
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low', normal: 'Normal', medium: 'Medium', high: 'High',
  urgent: 'Urgent', critical: 'Critical',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: '#64748b', normal: '#667eea', medium: '#d97706', high: '#ea580c',
  urgent: '#dc2626', critical: '#dc2626',
};
// Covers both task statuses and occurrence statuses.
const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', blocked: 'Blocked',
  done: 'Done', cancelled: 'Cancelled',
  acknowledged: 'Acknowledged', on_patrol: 'On Patrol',
  resolved: 'Resolved', closed: 'Closed',
};
const STATUS_COLORS: Record<string, string> = {
  open: '#3b82f6', in_progress: '#0ea5e9', blocked: '#d97706',
  done: '#16a34a', cancelled: '#64748b',
  acknowledged: '#7c3aed', on_patrol: '#0891b2',
  resolved: '#16a34a', closed: '#475569',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

export function renderTemplateString(
  tpl: string,
  vars: Record<string, string>,
): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '');
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDue(dueAt: string | null | undefined): string {
  if (!dueAt) return '';
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** Build the {{variable}} map for one email. */
export function taskEmailVars(data: TaskEmailData): Record<string, string> {
  return {
    task_title: data.title,
    task_priority: PRIORITY_LABELS[data.priority] ?? data.priority,
    task_status: STATUS_LABELS[data.status] ?? data.status,
    due_date: formatDue(data.dueAt) || 'No due date',
    ob_number: data.obNumber ?? '',
    assignee_name: data.assigneeName ?? 'the assignee',
    assigned_by_name: data.assignedByName ?? 'A team member',
    actor_name: data.actorName ?? data.assignedByName ?? 'A team member',
    org_name: data.orgName,
    overdue_by: data.overdueBy ?? '',
  };
}

// ─── The template ───────────────────────────────────────────────────────────
//
// Table-based, 600 px, inline styles only — renders correctly in Outlook,
// Gmail, Apple Mail and mobile clients. Light theme on purpose (email dark
// mode transforms are unreliable); brand accents carry the identity.

const BRAND_GRADIENT_FROM = '#667eea';
const BRAND_GRADIENT_TO = '#764ba2';

function chip(label: string, color: string): string {
  return `<span style="display:inline-block;padding:3px 12px;border-radius:999px;background:${color};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:.04em;">${escapeHtml(label)}</span>`;
}

function metaRow(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:7px 0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;vertical-align:top;width:120px;">${escapeHtml(label)}</td>
    <td style="padding:7px 0;font-size:14px;color:#1e293b;vertical-align:top;">${valueHtml}</td>
  </tr>`;
}

/**
 * Render one task email. Returns subject + HTML + plain-text alternative.
 * `settings` may be null/undefined — platform defaults apply.
 */
export function renderTaskEmail(
  event: TaskEmailEvent,
  data: TaskEmailData,
  settings?: Partial<OrgEmailSettingsRow> | null,
): { subject: string; html: string; text: string } {
  const meta = TASK_EMAIL_EVENT_META[event];
  const eventCfg = settings?.events?.[event] ?? {};
  const vars = taskEmailVars(data);

  const accent = settings?.accent_color || BRAND_GRADIENT_FROM;
  const eventColor = event === 'task.assigned' && settings?.accent_color
    ? settings.accent_color
    : meta.color;

  const subject = renderTemplateString(
    eventCfg.subject?.trim() || DEFAULT_EMAIL_SUBJECTS[event],
    vars,
  );
  const intro = renderTemplateString(
    eventCfg.intro?.trim() || DEFAULT_EMAIL_INTROS[event],
    vars,
  );

  const headlines: Record<TaskEmailEvent, string> = {
    'task.assigned': 'You have a new task',
    'occurrence.assigned': 'An occurrence needs your review',
    'task.updated': 'A task was updated',
    'occurrence.updated': 'An occurrence was updated',
    'task.completed': 'Task completed',
    'task.overdue': 'This task is overdue',
  };
  // Resolution is worth calling out in the headline rather than hiding it
  // behind a generic "updated".
  const isResolution = event === 'occurrence.updated'
    && (data.status === 'resolved' || data.status === 'closed');
  const headline: Record<TaskEmailEvent, string> = {
    ...headlines,
    'occurrence.updated': isResolution
      ? `Occurrence ${(STATUS_LABELS[data.status] ?? data.status).toLowerCase()}`
      : headlines['occurrence.updated'],
  };

  const appUrl = (data.appUrl ?? '').replace(/\/+$/, '');
  const isOccurrenceView = (data.urlPath ?? 'tasks') === 'occurrences';
  const taskUrl = appUrl ? `${appUrl}/${data.urlPath ?? 'tasks'}/${data.taskId}` : '';
  // Task emails that belong to an OB also link straight to that occurrence.
  const linkedOccurrenceUrl = appUrl && !isOccurrenceView && data.occurrenceId
    ? `${appUrl}/occurrences/${data.occurrenceId}`
    : '';
  const obUrl = isOccurrenceView ? taskUrl : linkedOccurrenceUrl;
  const prefsUrl = appUrl ? `${appUrl}/settings/notifications` : '';

  const greeting = data.recipientName ? `Hi ${escapeHtml(data.recipientName)},` : 'Hi,';

  const description = (data.description ?? '').trim();
  const shortDesc = description.length > 400 ? `${description.slice(0, 400)}…` : description;

  const isOverdue = event === 'task.overdue';
  const dueHtml = data.dueAt
    ? `<span style="${isOverdue ? 'color:#dc2626;font-weight:700;' : ''}">${escapeHtml(formatDue(data.dueAt))}${isOverdue && data.overdueBy ? ` &nbsp;·&nbsp; overdue by ${escapeHtml(data.overdueBy)}` : ''}</span>`
    : '<span style="color:#94a3b8;">No due date</span>';

  const noteSource = event === 'task.completed'
    ? (data.completionNotes ?? data.notes)
    : data.notes;
  const note = (noteSource ?? '').trim();

  const metaRows = [
    metaRow('Priority', chip(PRIORITY_LABELS[data.priority] ?? data.priority, PRIORITY_COLORS[data.priority] ?? '#64748b')),
    metaRow('Status', chip(STATUS_LABELS[data.status] ?? data.status, STATUS_COLORS[data.status] ?? '#64748b')),
    metaRow('Due', dueHtml),
    data.obNumber
      ? metaRow(
          isOccurrenceView ? 'OB number' : 'Linked OB',
          obUrl
            // The OB itself is clickable — the shortest path to the record.
            ? `<a href="${obUrl}" target="_blank" style="font-weight:700;color:${accent};text-decoration:underline;">${escapeHtml(data.obNumber)}</a>`
            : `<span style="font-weight:600;color:${accent};">${escapeHtml(data.obNumber)}</span>`,
        )
      : '',
    data.assignedByName ? metaRow('Assigned by', escapeHtml(data.assignedByName)) : '',
    data.assigneeName ? metaRow('Assigned to', escapeHtml(data.assigneeName)) : '',
  ].filter(Boolean).join('');

  const ctaLabel = isOccurrenceView
    ? `Open ${data.obNumber ? escapeHtml(data.obNumber) : 'occurrence'}`
    : 'Open task';

  const ctaHtml = taskUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;">
        <tr><td style="border-radius:10px;background:${accent};background-image:linear-gradient(135deg,${accent},${BRAND_GRADIENT_TO});">
          <a href="${taskUrl}" target="_blank"
             style="display:inline-block;padding:13px 34px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
            ${ctaLabel}&nbsp;&rarr;
          </a>
        </td></tr>
      </table>
      ${linkedOccurrenceUrl ? `
      <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;">
        <a href="${linkedOccurrenceUrl}" target="_blank" style="color:${accent};font-weight:600;text-decoration:underline;">
          View occurrence ${data.obNumber ? escapeHtml(data.obNumber) : ''}&nbsp;&rarr;
        </a>
      </p>` : ''}
      <!-- Plain URL fallback: some clients strip styled buttons. -->
      <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.6;color:#94a3b8;word-break:break-all;">
        Button not working? Copy this link:<br>
        <a href="${taskUrl}" target="_blank" style="color:#94a3b8;text-decoration:underline;">${taskUrl}</a>
      </p>`
    : '';

  const footerNote = (settings?.footer_note ?? '').trim();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f7;-webkit-text-size-adjust:100%;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(renderTemplateString(DEFAULT_EMAIL_SUBJECTS[event], vars))} — ${escapeHtml(data.orgName)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;padding:32px 12px;">
    <tr><td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08);">

        <!-- Brand header -->
        <tr>
          <td bgcolor="${accent}" style="background-image:linear-gradient(135deg,${accent} 0%,${BRAND_GRADIENT_TO} 100%);padding:22px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-family:'Segoe UI',Arial,sans-serif;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:.14em;">
                DIGILOG360
              </td>
              <td align="right" style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;font-weight:600;color:rgba(255,255,255,.85);">
                ${escapeHtml(data.orgName)}
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Event band -->
        <tr>
          <td style="padding:34px 32px 0;font-family:'Segoe UI',Arial,sans-serif;">
            ${chip(meta.pill, eventColor)}
            <h1 style="margin:14px 0 0;font-size:24px;line-height:1.25;color:#0f172a;font-weight:800;">
              ${escapeHtml(headline[event])}
            </h1>
          </td>
        </tr>

        <!-- Greeting + intro -->
        <tr>
          <td style="padding:18px 32px 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.65;color:#334155;">
            <p style="margin:0 0 6px;">${greeting}</p>
            <p style="margin:0;">${escapeHtml(intro)}</p>
          </td>
        </tr>

        <!-- Task card -->
        <tr>
          <td style="padding:24px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="border:1px solid #e2e8f0;border-left:4px solid ${isOverdue ? '#dc2626' : (PRIORITY_COLORS[data.priority] ?? accent)};border-radius:12px;background:#f8fafc;">
              <tr>
                <td style="padding:20px 22px;font-family:'Segoe UI',Arial,sans-serif;">
                  <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">${escapeHtml(data.title)}</p>
                  ${shortDesc ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(shortDesc)}</p>` : ''}
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:6px;">
                    ${metaRows}
                  </table>
                  ${note ? `
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
                    <tr><td style="border-left:3px solid ${eventColor};background:#ffffff;border-radius:0 8px 8px 0;padding:10px 14px;">
                      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">Latest note</p>
                      <p style="margin:4px 0 0;font-size:14px;line-height:1.6;color:#334155;font-style:italic;">&ldquo;${escapeHtml(note)}&rdquo;</p>
                    </td></tr>
                  </table>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr><td style="padding:0 32px;" align="center">${ctaHtml}</td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:26px 32px 30px;font-family:'Segoe UI',Arial,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;">
              <tr><td style="padding-top:18px;font-size:12px;line-height:1.7;color:#94a3b8;">
                ${footerNote ? `<p style="margin:0 0 8px;color:#64748b;">${escapeHtml(footerNote)}</p>` : ''}
                <p style="margin:0;">
                  You are receiving this because you are involved in this task in <strong style="color:#64748b;">${escapeHtml(data.orgName)}</strong> on Digilog360.
                  ${prefsUrl ? `Manage your alerts under <a href="${prefsUrl}" style="color:${accent};text-decoration:none;font-weight:600;">Settings &rarr; My Preferences</a>.` : ''}
                </p>
                <p style="margin:10px 0 0;">Digilog360 &middot; Security Operations Platform &middot; &copy; ${new Date().getFullYear()} Netstream Intergrated Solutions</p>
              </td></tr>
            </table>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    headline[event],
    '',
    intro,
    '',
    `Task: ${data.title}`,
    shortDesc ? `Details: ${shortDesc}` : '',
    `Priority: ${vars.task_priority} · Status: ${vars.task_status}`,
    `Due: ${vars.due_date}${isOverdue && data.overdueBy ? ` (overdue by ${data.overdueBy})` : ''}`,
    data.obNumber ? `Linked OB: ${data.obNumber}` : '',
    data.assignedByName ? `Assigned by: ${data.assignedByName}` : '',
    note ? `Latest note: "${note}"` : '',
    taskUrl ? `\n${isOccurrenceView ? 'Open the occurrence' : 'Open the task'}: ${taskUrl}` : '',
    linkedOccurrenceUrl ? `View occurrence ${data.obNumber ?? ''}: ${linkedOccurrenceUrl}` : '',
    `\n— Digilog360 · ${data.orgName}`,
  ].filter((l) => l !== '');

  return { subject, html, text: textLines.join('\n') };
}

/** Realistic sample payload for previews and test sends. */
export function sampleTaskEmailData(orgName: string, appUrl?: string | null): TaskEmailData {
  return {
    taskId: 482,
    occurrenceId: 15481,
    title: 'Replace beam sensor — north perimeter',
    description:
      'The IR beam on the north fence line is intermittently faulting and raising false alarms. Swap the unit, realign, and confirm three clean triggers with the control room.',
    priority: 'high',
    status: 'in_progress',
    dueAt: new Date(Date.now() + 26 * 3600_000).toISOString(),
    obNumber: 'OB-2026-04181',
    assigneeName: 'Sipho Dlamini',
    assignedByName: 'Ayesha Khan',
    actorName: 'Sipho Dlamini',
    notes: 'Unit swapped, waiting on control room to confirm the trigger checks.',
    orgName,
    appUrl: appUrl ?? 'https://digilog360.example',
    recipientName: 'Sipho',
    overdueBy: '3 h 20 m',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Welcome pack
//
// Sent by a super user to onboard someone: where to sign in, the address that
// doubles as their username, and how to get in the first time. Kept separate
// from the task alerts above because it isn't tied to a task or an occurrence,
// and because it can carry a credential — which is why it gets its own event
// name ('user.welcome') in the delivery ledger and its own renderer.
//
// Two shapes, chosen by the caller:
//   • password  — a one-time password is printed in the mail, to be changed
//                 on first sign-in.
//   • link      — nothing secret is printed; the recipient follows a
//                 set-your-own-password link instead. Safer, and the default
//                 we recommend where the recipient can receive mail reliably.
//
// And two audiences, because they need to be told different things:
//   • new       — never had an account. "Welcome aboard, here's how to get in."
//   • existing  — already uses Digilog360 and their sign-in address is
//                 changing. Greeting them with "welcome, your account has been
//                 created" would be wrong and confusing; what they actually
//                 need to know is that their OLD address stops working.
// ─────────────────────────────────────────────────────────────────────────────

/** Who the pack is going to — drives the wording, not the mechanics. */
export type WelcomeAudience = 'new' | 'existing';

export interface WelcomeEmailData {
  /** First name or full name; falls back to a plain "Hi," when absent. */
  recipientName: string | null;
  /** Sign-in address — this is also the username. */
  email: string;
  /** One-time password to print, or null when sending a set-password link. */
  password: string | null;
  /** Set-your-own-password link, used when `password` is null. */
  setPasswordUrl?: string | null;
  orgName: string;
  appUrl?: string | null;
  /** e.g. "Control Room", "Supervisor" — shown on the credentials card. */
  roleLabel?: string | null;
  /** Optional personal line from whoever is onboarding them. */
  message?: string | null;
  senderName?: string | null;
  /** Defaults to 'new'. */
  audience?: WelcomeAudience;
  /**
   * The address they used to sign in with, shown to an existing user so it is
   * unambiguous which login is being replaced.
   */
  previousEmail?: string | null;
}

export const DEFAULT_WELCOME_SUBJECT = 'Welcome to Digilog360 — your {{org_name}} account is ready';

export const DEFAULT_WELCOME_INTRO =
  'Your Digilog360 account has been created. Everything you need to sign in for the first time is below.';

export const DEFAULT_UPDATED_SUBJECT = 'Your Digilog360 username has been updated — {{org_name}}';

export const DEFAULT_UPDATED_INTRO =
  'We have updated the username you use to sign in to Digilog360. Your access and your history remain unchanged, and you may continue using your current password.';

/** Variables available in the welcome subject/intro overrides. */
export const WELCOME_TEMPLATE_VARS = [
  { key: '{{recipient_name}}', label: "Recipient's name" },
  { key: '{{org_name}}', label: 'Organisation name' },
  { key: '{{email}}', label: 'Sign-in address / username' },
  { key: '{{role}}', label: 'Role label' },
  { key: '{{app_url}}', label: 'Sign-in link' },
  { key: '{{sender_name}}', label: 'Who sent the pack' },
] as const;

function welcomeVars(data: WelcomeEmailData): Record<string, string> {
  const appUrl = (data.appUrl ?? '').replace(/\/+$/, '');
  return {
    recipient_name: data.recipientName ?? 'there',
    org_name: data.orgName,
    email: data.email,
    role: data.roleLabel ?? 'Team member',
    app_url: appUrl ? `${appUrl}/login` : '',
    sender_name: data.senderName ?? '',
  };
}

/**
 * Render the welcome pack. Same shell as the task alerts so the two read as
 * one family, but the body leads with the credentials card rather than a task.
 */
export function renderWelcomeEmail(
  data: WelcomeEmailData,
  settings?: Partial<OrgEmailSettingsRow> | null,
): { subject: string; html: string; text: string } {
  const vars = welcomeVars(data);
  const accent = settings?.accent_color || BRAND_GRADIENT_FROM;
  const isExisting = data.audience === 'existing';

  const subject = renderTemplateString(
    isExisting ? DEFAULT_UPDATED_SUBJECT : DEFAULT_WELCOME_SUBJECT,
    vars,
  );
  const intro = renderTemplateString(
    isExisting ? DEFAULT_UPDATED_INTRO : DEFAULT_WELCOME_INTRO,
    vars,
  );

  const appUrl = (data.appUrl ?? '').replace(/\/+$/, '');
  const loginUrl = appUrl ? `${appUrl}/login` : '';
  const greeting = data.recipientName ? `Hi ${escapeHtml(data.recipientName)},` : 'Hi,';
  const usesLink = !data.password && !!data.setPasswordUrl;
  const ctaUrl = usesLink ? (data.setPasswordUrl as string) : loginUrl;
  const ctaLabel = isExisting
    ? 'Confirm my new username'
    : usesLink ? 'Choose your password' : 'Sign in to Digilog360';

  // The credential block. A monospaced, boxed value is far easier to retype
  // off a phone than inline body text, and the label row matches the meta
  // rows used by the task emails.
  const passwordLabelHtml = (body: string) => `<tr>
        <td style="padding:7px 0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;vertical-align:top;width:120px;">Password</td>
        <td style="padding:7px 0;font-size:14px;color:#1e293b;vertical-align:top;">${body}</td>
      </tr>`;

  const secretHtml = data.password
    ? `<tr>
        <td style="padding:7px 0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;vertical-align:top;width:120px;">Password</td>
        <td style="padding:7px 0;vertical-align:top;">
          <span style="display:inline-block;padding:7px 14px;border-radius:8px;background:#0f172a;color:#ffffff;font-family:Consolas,'Courier New',monospace;font-size:16px;font-weight:700;letter-spacing:.06em;">${escapeHtml(data.password)}</span>
        </td>
      </tr>`
    // An existing user already has a password that works, so the honest answer
    // is "nothing to do here unless you want to" — not "you'll choose one".
    : isExisting
      ? passwordLabelHtml('<strong>Unchanged</strong> — keep the one you already use, or create a new one.')
      : passwordLabelHtml("You'll choose your own — use the button below.");

  const credentialRows = [
    metaRow(
      'Sign-in link',
      loginUrl
        ? `<a href="${loginUrl}" target="_blank" style="font-weight:700;color:${accent};text-decoration:underline;">${escapeHtml(loginUrl)}</a>`
        : '<span style="color:#94a3b8;">Provided separately</span>',
    ),
    metaRow(
      isExisting ? 'New username' : 'Username',
      `<strong style="font-family:Consolas,'Courier New',monospace;">${escapeHtml(data.email)}</strong>`,
    ),
    // Spelling out the address being replaced removes any doubt about which
    // login just stopped working.
    isExisting && data.previousEmail
      ? metaRow(
          'Previously',
          `<span style="font-family:Consolas,'Courier New',monospace;color:#94a3b8;text-decoration:line-through;">${escapeHtml(data.previousEmail)}</span>`,
        )
      : '',
    secretHtml,
    data.roleLabel ? metaRow('Your role', escapeHtml(data.roleLabel)) : '',
  ].filter(Boolean).join('');

  // Only shown when a password is printed — a link-based pack has no secret
  // sitting in the mailbox to worry about.
  const securityNote = data.password
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
        <tr><td style="border-left:3px solid #f59e0b;background:#fffbeb;border-radius:0 8px 8px 0;padding:11px 14px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b45309;">Please change this</p>
          <p style="margin:4px 0 0;font-size:13px;line-height:1.6;color:#78350f;">
            This is a one-time password. Change it as soon as you sign in, under <strong>Settings &rarr; Security</strong>, and don't share it with anyone.
          </p>
        </td></tr>
      </table>`
    : '';

  // The single most important fact for an existing user — too important to
  // leave as a line of body copy they might skim past.
  const oldLoginNote = isExisting
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
        <tr><td style="border-left:3px solid #f59e0b;background:#fffbeb;border-radius:0 8px 8px 0;padding:11px 14px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b45309;">Please note</p>
          <p style="margin:4px 0 0;font-size:13px;line-height:1.6;color:#78350f;">
            Your previous login will no longer work. Please use the username above from now on.
          </p>
        </td></tr>
      </table>`
    : '';

  // The reassuring half of the message: nothing is being forced on them.
  // Only true when no password was printed — if one was, theirs is already
  // gone and promising they can keep it would be a lie.
  const passwordChoiceNote = isExisting && !data.password
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr><td style="border-left:3px solid #16a34a;background:#f0fdf4;border-radius:0 8px 8px 0;padding:11px 14px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#15803d;">Your password, your choice</p>
          <p style="margin:4px 0 0;font-size:13px;line-height:1.6;color:#14532d;">
            You may continue using your current password, or create a new one.
            Both options are offered on the page that opens when you confirm below.
          </p>
        </td></tr>
      </table>`
    : '';

  const personalNote = (data.message ?? '').trim();
  const noteHtml = personalNote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr><td style="border-left:3px solid ${accent};background:#ffffff;border-radius:0 8px 8px 0;padding:10px 14px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">Note${data.senderName ? ` from ${escapeHtml(data.senderName)}` : ''}</p>
          <p style="margin:4px 0 0;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(personalNote)}</p>
        </td></tr>
      </table>`
    : '';

  // An existing user doesn't need to be taught the product — they need to know
  // what changed and to fix anything their browser has saved.
  const steps = isExisting
    ? [
        'Click the button above to confirm your new username.',
        data.password
          ? 'Sign in using the one-time password shown above.'
          : 'On the page that opens, choose whether to keep your current password or set a new one.',
        'Update your saved sign-in details on your browser or phone, so it stops offering the old username.',
      ]
    : [
        data.password
          ? 'Open the sign-in link and enter the username and password above.'
          : 'Click the button above and choose the password you would like to use.',
        'Set a password only you know, under Settings &rarr; Security.',
        'Check Settings &rarr; My Preferences so alerts reach you the way you want them.',
      ];
  const stepsHtml = steps
    .map((s, i) => `<tr>
      <td style="padding:6px 12px 6px 0;vertical-align:top;width:26px;">
        <span style="display:inline-block;width:22px;height:22px;border-radius:999px;background:${accent};color:#ffffff;font-size:12px;font-weight:700;text-align:center;line-height:22px;">${i + 1}</span>
      </td>
      <td style="padding:6px 0;font-size:14px;line-height:1.6;color:#475569;vertical-align:top;">${s}</td>
    </tr>`)
    .join('');

  const ctaHtml = ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;">
        <tr><td style="border-radius:10px;background:${accent};background-image:linear-gradient(135deg,${accent},${BRAND_GRADIENT_TO});">
          <a href="${ctaUrl}" target="_blank"
             style="display:inline-block;padding:13px 34px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
            ${ctaLabel}&nbsp;&rarr;
          </a>
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.6;color:#94a3b8;word-break:break-all;">
        Button not working? Copy this link:<br>
        <a href="${ctaUrl}" target="_blank" style="color:#94a3b8;text-decoration:underline;">${ctaUrl}</a>
      </p>`
    : '';

  const footerNote = (settings?.footer_note ?? '').trim();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef1f7;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Your ${escapeHtml(data.orgName)} account on Digilog360 is ready — here is how to sign in.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f7;padding:32px 12px;">
    <tr><td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08);">

        <!-- Brand header -->
        <tr>
          <td bgcolor="${accent}" style="background-image:linear-gradient(135deg,${accent} 0%,${BRAND_GRADIENT_TO} 100%);padding:22px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="font-family:'Segoe UI',Arial,sans-serif;font-size:17px;font-weight:800;color:#ffffff;letter-spacing:.14em;">
                DIGILOG360
              </td>
              <td align="right" style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;font-weight:600;color:rgba(255,255,255,.85);">
                ${escapeHtml(data.orgName)}
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Event band -->
        <tr>
          <td style="padding:34px 32px 0;font-family:'Segoe UI',Arial,sans-serif;">
            ${isExisting ? chip('USERNAME UPDATED', '#0ea5e9') : chip('WELCOME ABOARD', '#16a34a')}
            <h1 style="margin:14px 0 0;font-size:24px;line-height:1.25;color:#0f172a;font-weight:800;">
              ${isExisting ? 'Your username has been updated' : 'Welcome to Digilog360'}
            </h1>
          </td>
        </tr>

        <!-- Greeting + intro -->
        <tr>
          <td style="padding:18px 32px 0;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.65;color:#334155;">
            <p style="margin:0 0 6px;">${greeting}</p>
            <p style="margin:0;">${escapeHtml(intro)}</p>
          </td>
        </tr>

        <!-- Credentials card -->
        <tr>
          <td style="padding:24px 32px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                   style="border:1px solid #e2e8f0;border-left:4px solid ${accent};border-radius:12px;background:#f8fafc;">
              <tr>
                <td style="padding:20px 22px;font-family:'Segoe UI',Arial,sans-serif;">
                  <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">${isExisting ? 'Your new sign-in details' : 'Your sign-in details'}</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-top:1px solid #e2e8f0;padding-top:6px;">
                    ${credentialRows}
                  </table>
                  ${oldLoginNote}
                  ${passwordChoiceNote}
                  ${securityNote}
                  ${noteHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr><td style="padding:0 32px;" align="center">${ctaHtml}</td></tr>

        <!-- Getting started -->
        <tr>
          <td style="padding:30px 32px 0;font-family:'Segoe UI',Arial,sans-serif;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;">Getting started</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepsHtml}</table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:26px 32px 30px;font-family:'Segoe UI',Arial,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;">
              <tr><td style="padding-top:18px;font-size:12px;line-height:1.7;color:#94a3b8;">
                ${footerNote ? `<p style="margin:0 0 8px;color:#64748b;">${escapeHtml(footerNote)}</p>` : ''}
                <p style="margin:0;">
                  You are receiving this because ${isExisting ? 'your account details were updated' : 'an account was created for you'} in
                  <strong style="color:#64748b;">${escapeHtml(data.orgName)}</strong> on Digilog360.
                  If you weren't expecting it, please tell your administrator and do not sign in.
                </p>
                <p style="margin:10px 0 0;">Digilog360 &middot; Security Operations Platform &middot; &copy; ${new Date().getFullYear()} Netstream Intergrated Solutions</p>
              </td></tr>
            </table>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    isExisting ? 'Your Digilog360 username has been updated' : 'Welcome to Digilog360',
    '',
    intro,
    '',
    loginUrl ? `Sign in: ${loginUrl}` : '',
    `${isExisting ? 'New username' : 'Username'}: ${data.email}`,
    isExisting && data.previousEmail ? `Previously: ${data.previousEmail}` : '',
    isExisting ? 'Your previous login will no longer work — please use the username above from now on.' : '',
    isExisting && !data.password
      ? 'You may continue using your current password, or create a new one. Both options are offered on the page that opens when you confirm.'
      : '',
    data.password
      ? `Password: ${data.password}`
      : isExisting
        ? 'Password: unchanged — keep the one you already use, or create a new one.'
        : 'Password: choose your own using the link below.',
    data.roleLabel ? `Role: ${data.roleLabel}` : '',
    data.password
      ? '\nThis is a one-time password. Please change it as soon as you sign in, under Settings > Security.'
      : '',
    usesLink
      ? `\n${isExisting ? 'Confirm your new username' : 'Choose your password'}: ${data.setPasswordUrl}`
      : '',
    personalNote ? `\nNote${data.senderName ? ` from ${data.senderName}` : ''}: ${personalNote}` : '',
    `\n— Digilog360 · ${data.orgName}`,
  ].filter((l) => l !== '');

  return { subject, html, text: textLines.join('\n') };
}

/** Sample payload for the preview pane and for test sends. */
export function sampleWelcomeEmailData(
  orgName: string,
  appUrl?: string | null,
  audience: WelcomeAudience = 'new',
): WelcomeEmailData {
  return {
    recipientName: 'Sipho',
    email: 'sipho.dlamini@example.com',
    // Obviously-fake shape, so a preview can never be mistaken for a real
    // credential if it's forwarded on.
    password: 'Sample-Pass-0000',
    orgName,
    appUrl: appUrl ?? 'https://digilog360.example',
    roleLabel: 'Control Room',
    senderName: 'Ayesha Khan',
    message: 'Great to have you on the team — shout if anything looks off on your first shift.',
    audience,
    previousEmail: audience === 'existing' ? 's.dlamini@oldcompany.example' : null,
  };
}
