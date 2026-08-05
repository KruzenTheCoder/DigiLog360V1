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
  'task.updated',
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
    description: 'Sent to the assignee the moment a task is created for them or reassigned to them.',
    pill: 'NEW ASSIGNMENT',
    color: '#667eea',
  },
  'task.updated': {
    label: 'Task updated',
    description: 'Sent to the assigner and assignee (except the person who made the change) when the status changes or a note is posted.',
    pill: 'TASK UPDATED',
    color: '#0ea5e9',
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
  'task.updated': 'Task updated: {{task_title}}',
  'task.completed': 'Task completed: {{task_title}}',
  'task.overdue': 'Overdue task: {{task_title}}',
};

export const DEFAULT_EMAIL_INTROS: Record<TaskEmailEvent, string> = {
  'task.assigned':
    '{{assigned_by_name}} assigned a task to you in {{org_name}}. The details are below — open it in DigiLog to accept and track it.',
  'task.updated':
    '{{actor_name}} posted an update on a task you are involved in. The latest state is below.',
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
  recipientName?: string | null;
  /** Human-friendly “overdue by 3 h” string (overdue event only). */
  overdueBy?: string | null;
}

// ─── Self-contained label/colour maps (mirrors @digilog/shared constants) ───

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent',
};
const PRIORITY_COLORS: Record<string, string> = {
  low: '#64748b', normal: '#667eea', high: '#ea580c', urgent: '#dc2626',
};
const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', blocked: 'Blocked',
  done: 'Done', cancelled: 'Cancelled',
};
const STATUS_COLORS: Record<string, string> = {
  open: '#3b82f6', in_progress: '#0ea5e9', blocked: '#d97706',
  done: '#16a34a', cancelled: '#64748b',
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

  const headline: Record<TaskEmailEvent, string> = {
    'task.assigned': 'You have a new task',
    'task.updated': 'A task was updated',
    'task.completed': 'Task completed',
    'task.overdue': 'This task is overdue',
  };

  const appUrl = (data.appUrl ?? '').replace(/\/+$/, '');
  const taskUrl = appUrl ? `${appUrl}/tasks/${data.taskId}` : '';
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
      ? metaRow('Linked OB', `<span style="font-weight:600;color:${accent};">${escapeHtml(data.obNumber)}</span>`)
      : '',
    data.assignedByName ? metaRow('Assigned by', escapeHtml(data.assignedByName)) : '',
    data.assigneeName ? metaRow('Assigned to', escapeHtml(data.assigneeName)) : '',
  ].filter(Boolean).join('');

  const ctaHtml = taskUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 4px;">
        <tr><td style="border-radius:10px;background:${accent};background-image:linear-gradient(135deg,${accent},${BRAND_GRADIENT_TO});">
          <a href="${taskUrl}" target="_blank"
             style="display:inline-block;padding:13px 34px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
            Open task&nbsp;&rarr;
          </a>
        </td></tr>
      </table>`
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
                DIGILOG&nbsp;360
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
                  You are receiving this because you are involved in this task in <strong style="color:#64748b;">${escapeHtml(data.orgName)}</strong> on DigiLog&nbsp;360.
                  ${prefsUrl ? `Manage your alerts under <a href="${prefsUrl}" style="color:${accent};text-decoration:none;font-weight:600;">Settings &rarr; My Preferences</a>.` : ''}
                </p>
                <p style="margin:10px 0 0;">DigiLog 360 &middot; Security Operations Platform &middot; &copy; ${new Date().getFullYear()} Netstream Intergrated Solutions</p>
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
    taskUrl ? `\nOpen the task: ${taskUrl}` : '',
    `\n— DigiLog 360 · ${data.orgName}`,
  ].filter((l) => l !== '');

  return { subject, html, text: textLines.join('\n') };
}

/** Realistic sample payload for previews and test sends. */
export function sampleTaskEmailData(orgName: string, appUrl?: string | null): TaskEmailData {
  return {
    taskId: 482,
    title: 'Replace beam sensor — north perimeter',
    description:
      'The IR beam on the north fence line is intermittently faulting and raising false alarms. Swap the unit, realign, and confirm three clean test triggers with the control room.',
    priority: 'high',
    status: 'in_progress',
    dueAt: new Date(Date.now() + 26 * 3600_000).toISOString(),
    obNumber: 'OB-2026-04181',
    assigneeName: 'Sipho Dlamini',
    assignedByName: 'Ayesha Khan',
    actorName: 'Sipho Dlamini',
    notes: 'Unit swapped, waiting on control room to confirm the test triggers.',
    orgName,
    appUrl: appUrl ?? 'https://digilog360.example',
    recipientName: 'Sipho',
    overdueBy: '3 h 20 m',
  };
}
