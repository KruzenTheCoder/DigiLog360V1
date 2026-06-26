'use client';

import { Suspense, useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Logo } from '@/components/brand/logo';
import { BRAND } from '@digilog/shared';
import { signInAction } from './actions';

const ERROR_MESSAGES: Record<string, string> = {
  deactivated: 'Your account has been deactivated. Contact an administrator.',
  no_web_access: 'This console is for control room staff. Guards use the mobile app.',
  no_profile: 'Your sign-in succeeded but no profile was found. Please contact an administrator.',
  session_expired: 'Your session has expired. Please sign in again.',
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/menu';

  // The server action wraps signInWithPassword + redirect in a single
  // HTTP response, so the Set-Cookie headers travel with the 302 and the
  // middleware on /menu sees the session on the very next request. This
  // is what makes login reliable on Vercel — the previous client-side
  // approach raced the cookie write against the navigation.
  const [state, formAction] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => signInAction(formData),
    null,
  );
  const urlError = params.get('error');
  const error = state?.error
    ?? (urlError && urlError in ERROR_MESSAGES ? ERROR_MESSAGES[urlError] : null);

  // Pre-fetch the destination so /menu's RSC payload is warm by the time
  // the server action redirects.
  useEffect(() => { router.prefetch(next); }, [router, next]);

  // If the layout bounced the user here with a real profile-gate error,
  // clear the stale session cookie so the next attempt starts clean.
  // We only act on KNOWN error params — `?redirect=` and `?next=` are benign.
  useEffect(() => {
    if (!urlError || !(urlError in ERROR_MESSAGES)) return;
    const supabase = createClient();
    supabase.auth.signOut().catch(() => { /* non-fatal */ });
  }, [urlError]);

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-brand-gradient p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo className="text-3xl" onDark />
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Security Operations Console</h1>
          <p className="mt-4 max-w-md text-white/80">
            Real-time occurrence tracking, SLA monitoring, patrol oversight and incident
            reporting — all in one command center.
          </p>
        </div>
        <p className="text-sm text-white/60">© {new Date().getFullYear()} {BRAND.company}</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Logo className="text-2xl" />
          </div>
          <h2 className="text-2xl font-bold">Sign in</h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">Access the security console.</p>

          <form action={formAction} className="mt-8 space-y-4">
            {/* Hidden `next` lets the action redirect to ?next= when present. */}
            <input type="hidden" name="next" value={next} />
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            <SubmitButton />
          </form>
        </div>
      </div>
    </div>
  );
}

function SubmitButton() {
  // useFormStatus reads the surrounding form's pending state — accurate
  // for the lifetime of the server-action round-trip, then resets.
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}
