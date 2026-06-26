'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Logo } from '@/components/brand/logo';
import { BRAND } from '@digilog/shared';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    ERROR_MESSAGES[params.get('error') ?? ''] ?? null,
  );

  // Pre-fetch the post-login destination so the navigation after sign-in
  // doesn't wait on a cold route compile + initial server render.
  useEffect(() => { router.prefetch(next); }, [router, next]);

  // If the layout bounced the user here with an error, their auth cookie is
  // probably still valid but the profile gate failed. Sign out client-side
  // so the next attempt starts from a clean slate (otherwise the cookie
  // would survive a manual /menu visit and the user would loop again).
  useEffect(() => {
    const errParam = params.get('error');
    if (!errParam) return;
    const supabase = createClient();
    supabase.auth.signOut().catch(() => { /* non-fatal */ });
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // Sign in — this is the only round-trip we MUST do here. The (app)/layout
    // already enforces is_active + web-role checks via requireProfile, so we
    // can skip the duplicate profile fetch here and shave ~80 ms off login.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Hard navigation — guarantees the freshly-set auth cookies are visible
    // to the middleware on the next request. router.replace + router.refresh
    // race the cookie write against the navigation and can produce a
    // transient redirect loop on the first attempt.
    window.location.replace(next);
  }

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

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
