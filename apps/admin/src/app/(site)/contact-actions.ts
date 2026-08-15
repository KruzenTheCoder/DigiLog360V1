'use server';

import { z } from 'zod';

/**
 * The public enquiry form on /answers.
 *
 * ── Why this does not go through the send-email edge function ────────────
 * That function requires either a signed-in admin/manager/control-room user or
 * the `x-internal-key` header, and a visitor filling in a marketing form is
 * neither. The admin app already carries `RESEND_API_KEY` server-side (it is
 * mirrored into the Vercel environment for exactly this kind of use), so this
 * posts to Resend directly from a server action. The key never reaches the
 * browser and no new secret has to be provisioned.
 *
 * ── Abuse ────────────────────────────────────────────────────────────────
 * This is a public, unauthenticated write path that costs money per call, so
 * it gets three cheap defences: a honeypot field, a minimum fill time, and
 * strict server-side validation. There is also a per-instance throttle below.
 *
 * Be clear about what that throttle is worth: serverless instances do not
 * share memory, so it slows a naive script and does nothing against a
 * distributed one. Real protection means a shared counter (Upstash, or a
 * Postgres table keyed on IP) or a CAPTCHA, and that is a deliberate follow-up
 * rather than something to pretend is already handled.
 */

const Enquiry = z.object({
  name: z.string().trim().min(2, 'Tell us who you are.').max(80),
  email: z.string().trim().email('That email address does not look right.').max(160),
  organisation: z.string().trim().max(120).optional().or(z.literal('')),
  message: z.string().trim().min(20, 'A little more detail helps us answer properly.').max(4000),
  // Honeypot. Named to look worth filling in; a human never sees it.
  website: z.string().max(0, 'Rejected.').optional().or(z.literal('')),
  // When the form was rendered, so we can tell a person from a script.
  renderedAt: z.coerce.number(),
});

export interface ContactResult {
  ok: boolean;
  message: string;
  /** Field-level problems, keyed by field name. */
  errors?: Partial<Record<'name' | 'email' | 'message', string>>;
}

/** Nothing fills in a 20-character message in under three seconds. */
const MIN_FILL_MS = 3000;

/** Per-instance throttle. See the caveat in the module comment. */
const RATE = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function throttled(key: string): boolean {
  const now = Date.now();
  const hits = (RATE.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    RATE.set(key, hits);
    return true;
  }
  hits.push(now);
  RATE.set(key, hits);
  // Keep the map from growing without bound on a long-lived instance.
  if (RATE.size > 500) {
    for (const [k, v] of RATE) {
      if (v.every((t) => now - t >= WINDOW_MS)) RATE.delete(k);
    }
  }
  return false;
}

/** Strip anything that could break out of the HTML body we build below. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function submitEnquiry(formData: FormData): Promise<ContactResult> {
  const parsed = Enquiry.safeParse({
    name: formData.get('name') ?? '',
    email: formData.get('email') ?? '',
    organisation: formData.get('organisation') ?? '',
    message: formData.get('message') ?? '',
    website: formData.get('website') ?? '',
    renderedAt: formData.get('renderedAt') ?? 0,
  });

  if (!parsed.success) {
    const errors: ContactResult['errors'] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'name' || field === 'email' || field === 'message') {
        errors[field] ??= issue.message;
      }
    }
    // A honeypot or timing failure has no field to point at. Answer it the
    // same way a success looks, so a script learns nothing from the response.
    if (Object.keys(errors).length === 0) {
      return { ok: true, message: 'Thanks — we have your message and will come back to you.' };
    }
    return { ok: false, message: 'Some details need a second look.', errors };
  }

  const data = parsed.data;

  if (Date.now() - data.renderedAt < MIN_FILL_MS) {
    return { ok: true, message: 'Thanks — we have your message and will come back to you.' };
  }

  if (throttled(data.email.toLowerCase())) {
    return {
      ok: false,
      message: 'That is a few messages in a short space of time. Email us directly and we will pick it up.',
    };
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO;
  const from = process.env.EMAIL_FROM ?? 'Digilog360 <no-reply@digilog360.co.za>';

  if (!key || !to) {
    // Configuration, not the visitor's problem — say so plainly rather than
    // pretending the message was sent.
    console.error(
      '[contact] not configured:',
      !key ? 'RESEND_API_KEY missing' : '',
      !to ? 'CONTACT_TO missing' : '',
    );
    return {
      ok: false,
      message: 'The form is not accepting messages right now. Please email us directly and we will reply the same day.',
    };
  }

  const subject = `Website enquiry — ${data.name}${data.organisation ? ` (${data.organisation})` : ''}`;
  const html = `
    <p><strong>${esc(data.name)}</strong>${data.organisation ? ` · ${esc(data.organisation)}` : ''}</p>
    <p><a href="mailto:${esc(data.email)}">${esc(data.email)}</a></p>
    <hr>
    <p style="white-space:pre-wrap">${esc(data.message)}</p>
  `;
  const text = `${data.name}${data.organisation ? ` (${data.organisation})` : ''}\n${data.email}\n\n${data.message}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        // So a reply in the inbox goes to the person who wrote in, not to us.
        reply_to: data.email,
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[contact] resend rejected:', res.status, detail.slice(0, 300));
      return {
        ok: false,
        message: 'We could not send that just now. Please try again, or email us directly.',
      };
    }
  } catch (err) {
    console.error('[contact] send threw:', err);
    return {
      ok: false,
      message: 'We could not send that just now. Please try again, or email us directly.',
    };
  }

  return { ok: true, message: 'Thanks — we have your message and will come back to you.' };
}
