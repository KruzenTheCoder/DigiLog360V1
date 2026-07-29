'use client';

import { useMemo, useState } from 'react';
import { Loader2, Check, EyeOff, Eye, Smartphone, LayoutGrid, ScanLine } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, Label } from '@/components/ui/input';
import { ROLE_LABELS, type AppRole } from '@digilog/shared';

interface Org { id: string; name: string; slug: string }
interface Grant { role: AppRole; capability_key: string }

// Mobile roles only — these are the people who use the app.
const MOBILE_ROLES: AppRole[] = ['guard', 'supervisor'];

const TAB_ITEMS: { key: string; label: string; hint: string }[] = [
  { key: 'mobile.tab.home',   label: 'Home',     hint: 'Guard portal home tab' },
  { key: 'mobile.tab.patrol', label: 'Patrol',   hint: 'Route patrol tab' },
  { key: 'mobile.tab.log',    label: 'Log (+)',  hint: 'Central log-occurrence button' },
  { key: 'mobile.tab.logs',   label: 'My Logs',  hint: 'My logged occurrences tab' },
];

const HOME_ITEMS: { key: string; label: string }[] = [
  { key: 'mobile.home.new_occurrence', label: 'New / Log Occurrence' },
  { key: 'mobile.home.duty',           label: 'Duty Maintenance' },
  { key: 'mobile.home.history',        label: 'History' },
  { key: 'mobile.home.shift',          label: 'Shift Duty' },
  { key: 'mobile.home.patrol',         label: 'Route Patrol' },
  { key: 'mobile.home.scan',           label: 'Scan Checkpoint' },
  { key: 'mobile.home.tasks',          label: 'My Tasks' },
  { key: 'mobile.home.visitors',       label: 'Visitors' },
  { key: 'mobile.home.keys',           label: 'Key Register' },
  { key: 'mobile.home.kpi',            label: 'KPI strip' },
  { key: 'mobile.home.supervisor_board', label: 'Site Board (supervisor)' },
  { key: 'mobile.home.team',           label: 'Team (supervisor)' },
];

// Feature switches inside a mobile screen (not a nav container).
const SCANNER_ITEMS: { key: string; label: string; hint: string }[] = [
  {
    key: 'mobile.visitors.gallery_pick',
    label: 'Scan licence from gallery',
    hint: 'Lets guards pick an existing photo instead of the live camera. Turn off to require a live scan at the gate.',
  },
];

const MASTER = 'mobile.tab_bar';

export function MobileLayoutControls({
  orgs, grants, selectedOrgId,
}: {
  orgs: Org[]; grants: Grant[]; selectedOrgId: string;
}) {
  const [role, setRole] = useState<AppRole>('guard');
  const [granted, setGranted] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const g of grants) s.add(`${g.role}::${g.capability_key}`);
    return s;
  });
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const gkey = (r: AppRole, cap: string) => `${r}::${cap}`;
  const isOn = (cap: string) => granted.has(gkey(role, cap));
  const isBusy = (cap: string) => pending.has(gkey(role, cap));

  async function setCap(cap: string, on: boolean) {
    const k = gkey(role, cap);
    setError(null);
    setPending((p) => new Set(p).add(k));
    setGranted((prev) => {
      const next = new Set(prev);
      if (on) next.add(k); else next.delete(k);
      return next;
    });
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rc = (supabase as any).from('role_capabilities');
    const { error: e } = on
      ? await rc.upsert({ org_id: selectedOrgId, role, capability_key: cap }, { onConflict: 'org_id,role,capability_key', ignoreDuplicates: true })
      : await rc.delete().eq('org_id', selectedOrgId).eq('role', role).eq('capability_key', cap);
    setPending((p) => { const n = new Set(p); n.delete(k); return n; });
    if (e) {
      setError(e.message);
      setGranted((prev) => { const next = new Set(prev); if (on) next.delete(k); else next.add(k); return next; }); // rollback
    }
  }

  const barOn = isOn(MASTER);

  // "Hide / Show bottom bar" preset = flip the master switch.
  async function toggleBar() { await setCap(MASTER, !barOn); }

  function orgQuery(id: string) {
    const params = new URLSearchParams(window.location.search);
    params.set('org', id);
    window.location.search = params.toString();
  }

  const otherOrgs = useMemo(() => orgs.filter((o) => o.id !== selectedOrgId), [orgs, selectedOrgId]);

  return (
    <div className="space-y-5">
      {/* Org + role pickers */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-5">
          {orgs.length > 1 && (
            <div>
              <Label className="text-xs">Organisation</Label>
              <Select value={selectedOrgId} onChange={(e) => orgQuery(e.target.value)}>
                <option value={selectedOrgId}>{orgs.find((o) => o.id === selectedOrgId)?.name}</option>
                {otherOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Role</Label>
            <div className="flex gap-1 rounded-xl border bg-[hsl(var(--surface))] p-1">
              {MOBILE_ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                    role === r ? 'bg-brand text-white shadow-sm' : 'text-[hsl(var(--muted))] hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          Could not save: {error}
        </div>
      )}

      {/* Bottom bar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-brand" /> Bottom Navigation Bar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Master / preset */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-4 dark:bg-slate-900">
            <div>
              <p className="font-semibold">{barOn ? 'Bottom bar is shown' : 'Bottom bar is hidden'}</p>
              <p className="text-xs text-[hsl(var(--muted))]">
                When hidden, {ROLE_LABELS[role]}s navigate entirely from the home cards.
              </p>
            </div>
            <Button
              variant={barOn ? 'secondary' : 'default'}
              onClick={toggleBar}
              disabled={isBusy(MASTER)}
            >
              {isBusy(MASTER) ? <Loader2 className="h-4 w-4 animate-spin" /> : barOn ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {barOn ? 'Hide bottom bar' : 'Show bottom bar'}
            </Button>
          </div>

          {/* Individual tabs */}
          <div className={barOn ? '' : 'pointer-events-none opacity-40'}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">Tabs in the bar</p>
            <div className="divide-y">
              {TAB_ITEMS.map((t) => (
                <ToggleRow
                  key={t.key}
                  label={t.label} hint={t.hint}
                  on={isOn(t.key)} busy={isBusy(t.key)}
                  onChange={(v) => setCap(t.key, v)}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Home cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LayoutGrid className="h-5 w-5 text-brand" /> Home Cards</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {HOME_ITEMS.map((h) => (
            <ToggleRow
              key={h.key}
              label={h.label}
              on={isOn(h.key)} busy={isBusy(h.key)}
              onChange={(v) => setCap(h.key, v)}
            />
          ))}
        </CardContent>
      </Card>

      {/* In-screen feature switches */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-brand" /> Visitor Scanner</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {SCANNER_ITEMS.map((s) => (
            <ToggleRow
              key={s.key}
              label={s.label} hint={s.hint}
              on={isOn(s.key)} busy={isBusy(s.key)}
              onChange={(v) => setCap(s.key, v)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({
  label, hint, on, busy, onChange,
}: {
  label: string; hint?: string; on: boolean; busy?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate font-medium">{label}</p>
        {hint && <p className="text-xs text-[hsl(var(--muted))]">{hint}</p>}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => onChange(!on)}
        aria-pressed={on}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
          on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
        }`}
      >
        <span className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-sm transition ${on ? 'translate-x-5' : 'translate-x-1'}`}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin text-slate-500" /> : on ? <Check className="h-3 w-3 text-emerald-500" /> : null}
        </span>
      </button>
    </div>
  );
}
