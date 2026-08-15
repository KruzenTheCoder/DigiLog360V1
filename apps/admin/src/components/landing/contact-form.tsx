'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, Send, Check, AlertCircle } from 'lucide-react';
import { Reveal } from './reveal';
import { submitEnquiry, type ContactResult } from '@/app/(site)/contact-actions';

/**
 * The enquiry form that closes /answers.
 *
 * The page answers the questions somebody arrives with; this is where they ask
 * the one that is not on the list. It sits in the gap the hero used to leave
 * empty, and it is the only place on the marketing site that asks the visitor
 * for anything.
 *
 * Three things it does that a form on a site like this usually does not:
 *
 *   • Labels are really associated with their fields. The console's shared
 *     `Label`/`Input` pair renders them as siblings with no `htmlFor`, which
 *     leaves every field unnamed to a screen reader — the finding from the
 *     accessibility audit. This one uses `useId` so the pairing is real, and
 *     errors are wired through `aria-describedby` and `aria-invalid`.
 *   • The result is announced. Success and failure both land in a live region,
 *     so somebody not looking at the screen is told what happened.
 *   • It fails honestly. If the server cannot send, it says the form is not
 *     accepting messages rather than showing a tick and dropping the message.
 */

const FALLBACK_EMAIL = 'info@netstreamis.co.za';

export function ContactForm() {
  const [state, setState] = useState<ContactResult | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Stamped on mount so the server can tell a person from a script.
  const renderedAt = useRef<number>(0);
  useEffect(() => { renderedAt.current = Date.now(); }, []);

  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;
  const err = (f: 'name' | 'email' | 'message') => state?.errors?.[f];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setState(null);

    const fd = new FormData(e.currentTarget);
    fd.set('renderedAt', String(renderedAt.current || Date.now()));

    try {
      const result = await submitEnquiry(fd);
      setState(result);
      if (result.ok) formRef.current?.reset();
    } catch {
      setState({ ok: false, message: 'Something went wrong on our side. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  const field =
    'w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3.5 py-2.5 text-[0.95rem] ' +
    'outline-none transition placeholder:text-[hsl(var(--muted))]/70 ' +
    'focus:border-[hsl(var(--brand))] focus:ring-2 focus:ring-[hsl(var(--brand))]/25 ' +
    'aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-500/20';

  const label = 'mb-1.5 block text-[0.82rem] font-semibold tracking-tight';

  return (
    <section className="relative isolate w-full bg-[hsl(var(--background))] pb-20 pt-4 lg:pb-28">
      <div className="site-w">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          {/* ── The ask ─────────────────────────────────────────────────── */}
          <Reveal className="min-w-0">
            <p className="font-mono text-[0.66rem] font-bold uppercase tracking-[0.22em] text-[hsl(var(--brand))]">
              Still not answered
            </p>
            <h2 className="mt-5 max-w-[15ch] text-[clamp(1.8rem,3.6vw,2.9rem)] font-extrabold leading-[1.06] tracking-[-0.032em]">
              Ask us the one that is not on the list.
            </h2>
            <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-[hsl(var(--muted))]">
              A real person reads these. Tell us what you are running now and what
              you need it to do, and we will tell you honestly whether this fits.
            </p>
            <p className="mt-6 text-sm text-[hsl(var(--muted))]">
              Or write to{' '}
              <a
                href={`mailto:${FALLBACK_EMAIL}`}
                className="font-medium text-[hsl(var(--brand))] underline-offset-4 hover:underline"
              >
                {FALLBACK_EMAIL}
              </a>
              .
            </p>
          </Reveal>

          {/* ── The form ────────────────────────────────────────────────── */}
          <Reveal delay={100} className="min-w-0">
            <form
              ref={formRef}
              onSubmit={onSubmit}
              noValidate
              className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-5 shadow-sm sm:p-7"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor={id('name')} className={label}>
                    Your name
                  </label>
                  <input
                    id={id('name')}
                    name="name"
                    autoComplete="name"
                    required
                    className={field}
                    placeholder="Thandi Mokoena"
                    aria-invalid={!!err('name')}
                    aria-describedby={err('name') ? id('name-err') : undefined}
                  />
                  {err('name') && (
                    <p id={id('name-err')} className="mt-1.5 text-[0.8rem] text-red-600">
                      {err('name')}
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <label htmlFor={id('org')} className={label}>
                    Organisation <span className="font-normal text-[hsl(var(--muted))]">(optional)</span>
                  </label>
                  <input
                    id={id('org')}
                    name="organisation"
                    autoComplete="organization"
                    className={field}
                    placeholder="Which company"
                  />
                </div>
              </div>

              <div className="mt-4 min-w-0">
                <label htmlFor={id('email')} className={label}>
                  Email
                </label>
                <input
                  id={id('email')}
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  className={field}
                  placeholder="you@company.co.za"
                  aria-invalid={!!err('email')}
                  aria-describedby={err('email') ? id('email-err') : undefined}
                />
                {err('email') && (
                  <p id={id('email-err')} className="mt-1.5 text-[0.8rem] text-red-600">
                    {err('email')}
                  </p>
                )}
              </div>

              <div className="mt-4 min-w-0">
                <label htmlFor={id('msg')} className={label}>
                  What would you like to know?
                </label>
                <textarea
                  id={id('msg')}
                  name="message"
                  rows={5}
                  required
                  className={`${field} resize-y`}
                  placeholder="How many sites, how many officers, and what you are using today."
                  aria-invalid={!!err('message')}
                  aria-describedby={err('message') ? id('msg-err') : undefined}
                />
                {err('message') && (
                  <p id={id('msg-err')} className="mt-1.5 text-[0.8rem] text-red-600">
                    {err('message')}
                  </p>
                )}
              </div>

              {/* Honeypot. Hidden from people and from assistive tech; a script
                  filling every field is the only thing that will complete it. */}
              <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
                <label htmlFor={id('website')}>Website</label>
                <input id={id('website')} name="website" tabIndex={-1} autoComplete="off" />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-[hsl(var(--brand))] px-5 text-base font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand))]/50 disabled:opacity-60"
                >
                  {pending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                    : <>Send it <Send className="h-4 w-4" /></>}
                </button>

                <p className="text-[0.78rem] leading-snug text-[hsl(var(--muted))]">
                  We use this to reply. Nothing else.
                </p>
              </div>

              {/* The outcome, announced as well as shown. */}
              <div aria-live="polite" className="empty:hidden">
                {state && (
                  <p
                    className={`mt-5 flex items-start gap-2 rounded-lg border px-4 py-3 text-[0.9rem] ${
                      state.ok
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                    }`}
                  >
                    {state.ok
                      ? <Check className="mt-0.5 h-4 w-4 shrink-0" />
                      : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                    {state.message}
                  </p>
                )}
              </div>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
