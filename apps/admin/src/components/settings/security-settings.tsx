'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type EnrollPhase =
  | { kind: 'idle' }
  | { kind: 'enrolling'; qrCode: string; factorId: string; secret: string; code: string }
  | { kind: 'done' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mfa = any;

export function SecuritySettings() {
  const [factors, setFactors] = useState<Array<{ id: string; status: string; friendly_name?: string | null }>>([]);
  const [phase, setPhase] = useState<EnrollPhase>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const supabase = createClient();
    const { data } = await (supabase.auth.mfa as Mfa).listFactors();
    const totp = (data?.totp ?? []) as typeof factors;
    setFactors(totp);
  }

  useEffect(() => { refresh(); }, []);

  async function startEnroll() {
    setBusy(true); setError(null);
    const supabase = createClient();
    const { data, error } = await (supabase.auth.mfa as Mfa).enroll({ factorType: 'totp', friendlyName: 'DigiLog 360' });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setPhase({
      kind: 'enrolling',
      qrCode: data.totp.qr_code,
      factorId: data.id,
      secret: data.totp.secret,
      code: '',
    });
  }

  async function verifyCode(code: string, factorId: string) {
    setBusy(true); setError(null);
    const supabase = createClient();
    const { data: challenge, error: cErr } = await (supabase.auth.mfa as Mfa).challenge({ factorId });
    if (cErr) { setError(cErr.message); setBusy(false); return; }
    const { error: vErr } = await (supabase.auth.mfa as Mfa).verify({
      factorId, challengeId: challenge.id, code,
    });
    setBusy(false);
    if (vErr) { setError(vErr.message); return; }
    setPhase({ kind: 'done' });
    refresh();
  }

  async function unenroll(factorId: string) {
    if (!confirm('Disable 2FA on this account?')) return;
    const supabase = createClient();
    await (supabase.auth.mfa as Mfa).unenroll({ factorId });
    refresh();
  }

  const verified = factors.find((f) => f.status === 'verified');

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-center gap-3">
          {verified
            ? <ShieldCheck className="h-8 w-8 text-green-600" />
            : <ShieldAlert className="h-8 w-8 text-amber-600" />}
          <div className="flex-1">
            <p className="font-semibold">Two-factor authentication</p>
            <p className="text-sm text-[hsl(var(--muted))]">
              {verified ? 'Active — you sign in with a TOTP code in addition to your password.' : 'Not enabled. Strongly recommended for admins.'}
            </p>
          </div>
          {verified ? (
            <Badge color="#16a34a">Active</Badge>
          ) : (
            <Button onClick={startEnroll} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Enable 2FA
            </Button>
          )}
        </div>

        {phase.kind === 'enrolling' && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Scan with your authenticator app</p>
            <p className="text-xs text-[hsl(var(--muted))]">
              Or enter the secret manually: <code className="font-mono">{phase.secret}</code>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={phase.qrCode} alt="2FA QR" className="h-40 w-40 self-start" />
            <div className="max-w-[12rem]">
              <Label>6-digit code</Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={phase.code}
                onChange={(e) => setPhase((p) => p.kind === 'enrolling' ? { ...p, code: e.target.value } : p)}
              />
            </div>
            <Button
              onClick={() => phase.kind === 'enrolling' && verifyCode(phase.code, phase.factorId)}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify & enable
            </Button>
          </div>
        )}

        {verified && (
          <div className="rounded-lg border p-3 text-sm">
            Factor: <code>{verified.friendly_name ?? 'TOTP'}</code>
            <Button size="sm" variant="ghost" className="ml-3" onClick={() => unenroll(verified.id)}>
              Remove
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
