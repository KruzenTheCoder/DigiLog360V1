'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Loader2, Search, UserCheck, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, type AppRole } from '@digilog/shared';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  roles: AppRole[] | null;
  job_title: string | null;
  site_id: string | null;
  is_assignable: boolean;
  is_active: boolean;
}

export function AssigneeToggleForm({
  rows, siteName,
}: {
  rows: Profile[];
  siteName: (siteId: string | null) => string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(rows.map((r) => [r.id, r.is_assignable])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [busyBatch, setBusyBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showOnly, setShowOnly] = useState<'all' | 'enabled' | 'inactive'>('all');
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return rows.filter((r) => {
      if (showOnly === 'enabled' && !state[r.id]) return false;
      if (showOnly === 'inactive' && r.is_active) return false;
      if (needle) {
        const hay = `${r.full_name ?? ''} ${r.email ?? ''} ${r.job_title ?? ''} ${r.role}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, showOnly, state]);

  const enabledCount = Object.values(state).filter(Boolean).length;

  async function toggle(id: string, next: boolean) {
    setPendingId(id);
    setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any)
      .from('profiles')
      .update({ is_assignable: next })
      .eq('id', id);
    if (e) {
      setError(`${id.slice(0, 8)}…: ${e.message}`);
      setState((s) => ({ ...s, [id]: !next }));
    } else {
      startTransition(() => router.refresh());
    }
    setPendingId(null);
  }

  async function bulkSetVisible(value: boolean) {
    if (filtered.length === 0) return;
    setBusyBatch(true);
    setError(null);
    const supabase = createClient();
    const ids = filtered.map((r) => r.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any)
      .from('profiles')
      .update({ is_assignable: value })
      .in('id', ids);
    if (e) setError(e.message);
    else {
      setState((s) => {
        const next = { ...s };
        for (const id of ids) next[id] = value;
        return next;
      });
      startTransition(() => router.refresh());
    }
    setBusyBatch(false);
  }

  return (
    <div className="space-y-4">
      {/* Summary + filters */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-brand" />
              <span>
                <strong>{enabledCount}</strong> assignable · {rows.length} total · {filtered.length} shown
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => bulkSetVisible(true)} disabled={busyBatch || filtered.length === 0}>
                {busyBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Enable all visible
              </Button>
              <Button size="sm" variant="ghost" onClick={() => bulkSetVisible(false)} disabled={busyBatch || filtered.length === 0}>
                Disable all visible
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
              <Input className="pl-9" placeholder="Search name, email, job title…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div role="tablist" className="inline-flex items-center gap-1 rounded-lg border bg-[hsl(var(--surface-alt))] p-1">
              {[
                { k: 'all',      label: 'All' },
                { k: 'enabled',  label: 'Enabled' },
                { k: 'inactive', label: 'Inactive' },
              ].map((t) => {
                const on = showOnly === t.k;
                return (
                  <button
                    key={t.k}
                    type="button"
                    onClick={() => setShowOnly(t.k as typeof showOnly)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      on
                        ? 'bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] shadow-sm'
                        : 'text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <Card>
        <CardContent className="divide-y p-0">
          {filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-[hsl(var(--muted))]">No users match these filters.</p>
          )}
          {filtered.map((r) => {
            const on = state[r.id] ?? false;
            const busy = pendingId === r.id;
            const allRoles = (r.roles && r.roles.length > 0 ? r.roles : [r.role]) as AppRole[];
            const site = siteName(r.site_id);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <div className="min-w-[220px] flex-1">
                  <p className="flex items-center gap-2 truncate font-semibold">
                    {on && <UserCheck className="h-4 w-4 text-emerald-500" />}
                    {r.full_name ?? '(no name)'}
                    {!r.is_active && <Badge color="#dc2626">Inactive</Badge>}
                  </p>
                  <p className="truncate text-xs text-[hsl(var(--muted))]">{r.email}</p>
                  {r.job_title && <p className="truncate text-[11px] text-[hsl(var(--muted))]">{r.job_title}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {allRoles.map((role) => (
                    <Badge key={role} color="#667eea">{ROLE_LABELS[role] ?? role}</Badge>
                  ))}
                  {site && <Badge color="#0ea5e9">{site}</Badge>}
                </div>
                <ToggleSwitch
                  on={on}
                  busy={busy}
                  onChange={(v) => {
                    setState((s) => ({ ...s, [r.id]: v }));
                    toggle(r.id, v);
                  }}
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
  on, busy, onChange,
}: { on: boolean; busy: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? 'Remove from assignment dropdown' : 'Add to assignment dropdown'}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-sm transition ${
          on ? 'translate-x-5' : 'translate-x-1'
        }`}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
          : on ? <Check className="h-3 w-3 text-emerald-500" /> : null}
      </span>
    </button>
  );
}
