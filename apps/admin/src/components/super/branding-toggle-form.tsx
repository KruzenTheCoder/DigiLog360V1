'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NetstreamLogo } from '@/components/brand/netstream-logo';

interface Org {
  id: string;
  name: string;
  slug: string;
  show_netstream_logo: boolean;
  is_active: boolean;
}

export function BrandingToggleForm({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(orgs.map((o) => [o.id, o.show_netstream_logo])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function toggle(id: string, next: boolean) {
    setPendingId(id);
    setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any)
      .from('organizations')
      .update({ show_netstream_logo: next })
      .eq('id', id);
    if (e) {
      setError(`${id.slice(0, 8)}…: ${e.message}`);
      // Revert optimistic update.
      setState((s) => ({ ...s, [id]: !next }));
    } else {
      // Make sure the layout (and so the header logo) pick up the new value.
      startTransition(() => router.refresh());
    }
    setPendingId(null);
  }

  return (
    <div className="space-y-5">
      {/* Preview card */}
      <Card>
        <CardHeader><CardTitle>Live preview</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-center rounded-lg border bg-slate-50 p-6 dark:bg-slate-900">
            <NetstreamLogo height={44} />
          </div>
          <p className="mt-3 text-xs text-[hsl(var(--muted))]">
            This logo appears centre-aligned in the top navigation bar across the admin app.
            Disable it per organisation for white-label deployments — toggles below take effect on the next page load.
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Per-organisation toggles</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {orgs.length === 0 && (
            <p className="py-4 text-sm text-[hsl(var(--muted))]">No organisations yet.</p>
          )}
          {orgs.map((o) => {
            const on = state[o.id] ?? true;
            const busy = pendingId === o.id;
            return (
              <div key={o.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{o.name}</p>
                  <p className="text-xs text-[hsl(var(--muted))]">
                    /{o.slug}
                    {!o.is_active && <> · <Badge color="#dc2626">Inactive</Badge></>}
                  </p>
                </div>
                <ToggleSwitch
                  on={on}
                  disabled={busy}
                  onChange={(v) => {
                    setState((s) => ({ ...s, [o.id]: v }));
                    toggle(o.id, v);
                  }}
                  label={on ? 'Logo visible' : 'Logo hidden'}
                  busy={busy}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleSwitch({
  on, disabled, onChange, label, busy,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[hsl(var(--muted))]">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
          on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
        }`}
        aria-pressed={on}
        aria-label={label}
      >
        <span
          className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-sm transition ${
            on ? 'translate-x-5' : 'translate-x-1'
          }`}
        >
          {busy
            ? <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
            : on
              ? <Check className="h-3 w-3 text-emerald-500" />
              : null}
        </span>
      </button>
    </div>
  );
}
