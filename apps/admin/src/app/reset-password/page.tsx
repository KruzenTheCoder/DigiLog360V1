'use client';

// Landing page for the recovery link in a welcome pack (and any future
// password-reset mail).
//
// Supabase appends the session to the URL FRAGMENT (#access_token=…), which the
// browser never sends to the server — so this page has to be public in the
// middleware and resolve the session client-side. `createBrowserClient` picks
// the fragment up on construction (detectSessionInUrl), which is why we simply
// poll getSession() rather than parsing the hash ourselves.
//
// The choice this page offers is the point of it: someone whose email address
// changed already knows a password that still works, so forcing a reset on them
// is busywork. They can keep it, or set a new one.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Logo } from '@/components/brand/logo';
import { BRAND } from '@digilog/shared';

type Phase =
  | { kind: 'loading' }
  | { kind: 'invalid'; reason?: string }
  | { kind: 'choosing'; email: string }
  | { kind: 'setting'; email: string }
  | { kind: 'done'; email: string; changed: boolean };

export default function ResetPasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the recovery session the link carried in the fragment.
  //
  // We parse the hash and call setSession explicitly rather than relying on
  // detectSessionInUrl: `createBrowserClient` runs the PKCE flow, which looks
  // for a `?code=` query param and ignores implicit-flow tokens in the
  // fragment. Supabase's admin-generated recovery links return exactly those
  // fragment tokens, so leaving it to the client silently produced no session.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashError = hash.get('error_description') ?? hash.get('error');
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');

    // Tokens in the address bar end up in history and in anything the user
    // copies, so clear them as soon as they've been read.
    const scrubUrl = () =>
      window.history.replaceState(null, '', window.location.pathname);

    (async () => {
      if (hashError) {
        scrubUrl();
        if (!cancelled) setPhase({ kind: 'invalid', reason: hashError.replace(/\+/g, ' ') });
        return;
      }

      if (accessToken && refreshToken) {
        const { data, error: sessErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        // A network failure here rejects rather than returning an error, and
        // an unhandled rejection would leave the page stuck on "Checking…".
        }).catch((e: unknown) => ({
          data: { session: null },
          error: { message: e instanceof Error ? e.message : String(e) },
        }));
        scrubUrl();
        if (cancelled) return;
        const email = data.session?.user?.email;
        if (!sessErr && email) { setPhase({ kind: 'choosing', email }); return; }
        setPhase({ kind: 'invalid', reason: sessErr?.message });
        return;
      }

      // No fragment — they may already be signed in (a refresh of this page,
      // for instance), in which case the same choice still applies.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const email = data.session?.user?.email;
      setPhase(email ? { kind: 'choosing', email } : { kind: 'invalid' });
    })();

    return () => { cancelled = true; };
  }, []);

  async function savePassword() {
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPhase((p) => ({ kind: 'done', email: 'email' in p ? p.email : '', changed: true }));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — mirrors the sign-in page so the journey feels continuous. */}
      <div className="relative hidden flex-col justify-between bg-brand-gradient p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo className="text-3xl" onDark />
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Welcome back</h1>
          <p className="mt-4 max-w-md text-white/80">
            Confirm how you would like to sign in from now on, and you are straight
            into the console.
          </p>
        </div>
        <p className="text-sm text-white/60">© {new Date().getFullYear()} {BRAND.company}</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <Logo className="text-2xl" />
          </div>

          {phase.kind === 'loading' && (
            <div className="flex items-center gap-3 text-sm text-[hsl(var(--muted))]">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your link…
            </div>
          )}

          {phase.kind === 'invalid' && (
            <>
              <h2 className="text-2xl font-bold">This link has expired</h2>
              <p className="mt-2 text-sm text-[hsl(var(--muted))]">
                Password links are valid for a short time and can only be used once.
                Ask your administrator to send you a new welcome pack, or sign in with
                the password you already have.
              </p>
              {phase.reason && (
                <p className="mt-2 text-xs text-[hsl(var(--muted))]">{phase.reason}</p>
              )}
              <Button className="mt-6 w-full" onClick={() => router.push('/login')}>
                Go to sign in
              </Button>
            </>
          )}

          {phase.kind === 'choosing' && (
            <>
              <h2 className="text-2xl font-bold">You&apos;re signed in</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted))]">
                From now on your username is{' '}
                <strong className="font-mono text-[hsl(var(--foreground))]">{phase.email}</strong>.
              </p>

              <div className="mt-8 space-y-3">
                <button
                  type="button"
                  onClick={() => setPhase({ kind: 'setting', email: phase.email })}
                  className="w-full rounded-xl border border-[hsl(var(--border))] p-4 text-left transition hover:border-[hsl(var(--brand))]"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <KeyRound className="h-4 w-4" /> Set a new password
                  </span>
                  <span className="mt-1 block text-xs text-[hsl(var(--muted))]">
                    Choose a password only you know.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPhase({ kind: 'done', email: phase.email, changed: false })}
                  className="w-full rounded-xl border border-[hsl(var(--border))] p-4 text-left transition hover:border-[hsl(var(--brand))]"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <ShieldCheck className="h-4 w-4" /> Keep my current password
                  </span>
                  <span className="mt-1 block text-xs text-[hsl(var(--muted))]">
                    Nothing changes — carry on using the password you already have.
                  </span>
                </button>
              </div>
            </>
          )}

          {phase.kind === 'setting' && (
            <>
              <h2 className="text-2xl font-bold">Choose a password</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted))]">
                For <span className="font-mono">{phase.email}</span>
              </p>
              <div className="mt-8 space-y-4">
                <div>
                  <Label htmlFor="pw">New password</Label>
                  <Input
                    id="pw" type="password" autoComplete="new-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <Label htmlFor="pw2">Confirm password</Label>
                  <Input
                    id="pw2" type="password" autoComplete="new-password"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                    onKeyDown={(e) => { if (e.key === 'Enter') void savePassword(); }}
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button className="w-full" onClick={savePassword} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busy ? 'Saving…' : 'Save password'}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-[hsl(var(--muted))] underline"
                  onClick={() => setPhase({ kind: 'choosing', email: phase.email })}
                >
                  Back
                </button>
              </div>
            </>
          )}

          {phase.kind === 'done' && (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                <Check className="h-6 w-6 text-emerald-600" />
              </div>
              <h2 className="mt-4 text-2xl font-bold">
                {phase.changed ? 'Password saved' : "You're all set"}
              </h2>
              <p className="mt-2 text-sm text-[hsl(var(--muted))]">
                {phase.changed
                  ? 'Use your new password the next time you sign in.'
                  : 'Your existing password still works — just remember to sign in with your new username.'}
              </p>
              <Button className="mt-6 w-full" onClick={() => router.push('/menu')}>
                Continue to Digilog360
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
