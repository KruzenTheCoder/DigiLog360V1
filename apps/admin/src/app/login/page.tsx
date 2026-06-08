'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { BRAND, WEB_ROLES } from '@digilog/shared';

const ERROR_MESSAGES: Record<string, string> = {
  deactivated: 'Your account has been deactivated. Contact an administrator.',
  no_web_access: 'This console is for control room staff. Guards use the mobile app.',
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    ERROR_MESSAGES[params.get('error') ?? ''] ?? null,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles').select('role, is_active').eq('id', data.user.id).single();

    if (!profile?.is_active) {
      await supabase.auth.signOut();
      setError(ERROR_MESSAGES.deactivated);
      setLoading(false);
      return;
    }
    if (!WEB_ROLES.includes(profile.role)) {
      await supabase.auth.signOut();
      setError(ERROR_MESSAGES.no_web_access);
      setLoading(false);
      return;
    }

    router.replace(params.get('next') || '/dashboard');
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-brand-gradient p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Image
            src={BRAND.logo.monogram}
            alt={`${BRAND.name} mark`}
            width={48}
            height={48}
            className="rounded-md bg-white/10 p-1"
            priority
          />
          <span className="text-2xl font-bold tracking-tight">{BRAND.name}</span>
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
          <div className="mb-8 flex items-center gap-2 text-brand lg:hidden">
            <Image
              src={BRAND.logo.monogram}
              alt={`${BRAND.name} mark`}
              width={36}
              height={36}
              priority
            />
            <span className="text-xl font-bold">{BRAND.name}</span>
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
