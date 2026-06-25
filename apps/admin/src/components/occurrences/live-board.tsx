'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, RefreshCw, FileText, Bell, ScrollText, PencilLine, RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { UpdateOccurrenceDialog } from './update-dialog';
import {
  SEVERITIES, SEVERITY_LABELS, SEVERITY_COLORS,
  type LiveOccurrence, type Profile,
} from '@digilog/shared';

// The live view selects o.*, so these timing columns are present even if the
// generated Row type lags behind. Extend locally and cast on read.
type LiveRow = LiveOccurrence & {
  sla_due_at: string | null;
  last_sla_update_at: string | null;
  sla_hours: number | null;
  update_interval_minutes: number | null;
};

const SELECT =
  'id, ob_number, occurrence_type, description, severity, status, site_name, logged_by_name, incident_at, sla_due_at, last_sla_update_at, sla_hours, update_interval_minutes, is_sla_breached, is_sla_update_due, minutes_remaining, has_report';

type SlaFilter = 'all' | 'breached' | 'due' | 'on_track';

export function LiveBoard({ initial, profile }: { initial: LiveOccurrence[]; profile: Profile }) {
  const router = useRouter();
  const [items, setItems] = useState<LiveRow[]>(initial as LiveRow[]);
  const [target, setTarget] = useState<LiveOccurrence | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Filters
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');
  const [sla, setSla] = useState<SlaFilter>('all');
  const [site, setSite] = useState('all');
  const [type, setType] = useState('all');

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from('occurrences_live')
      .select(SELECT)
      .order('incident_at', { ascending: false });
    if (data) setItems(data as unknown as LiveRow[]);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('live-occurrences')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const o = payload.new as { ob_number?: string };
          setFlash(`New occurrence ${o.ob_number ?? ''} logged`);
          setTimeout(() => setFlash(null), 6000);
        }
        refresh();
      })
      .subscribe();
    const tick = setInterval(refresh, 60_000); // keep computed SLA state fresh
    return () => { supabase.removeChannel(channel); clearInterval(tick); };
  }, [refresh]);

  const breached = items.filter((o) => o.is_sla_breached);
  const due = items.filter((o) => o.is_sla_update_due && !o.is_sla_breached);
  const onTrack = items.filter((o) => !o.is_sla_breached && !o.is_sla_update_due);

  // Distinct option lists for the filter dropdowns.
  const siteOptions = useMemo(
    () => [...new Set(items.map((o) => o.site_name).filter(Boolean) as string[])].sort(),
    [items],
  );
  const typeOptions = useMemo(
    () => [...new Set(items.map((o) => o.occurrence_type).filter(Boolean) as string[])].sort(),
    [items],
  );
  const statusOptions = useMemo(
    () => [...new Set(items.map((o) => o.status).filter(Boolean) as string[])].sort(),
    [items],
  );

  const filtered = items
    .filter((o) => {
      if (severity !== 'all' && o.severity !== severity) return false;
      if (status !== 'all' && o.status !== status) return false;
      if (site !== 'all' && (o.site_name ?? '') !== site) return false;
      if (type !== 'all' && o.occurrence_type !== type) return false;
      if (sla === 'breached' && !o.is_sla_breached) return false;
      if (sla === 'due' && !(o.is_sla_update_due && !o.is_sla_breached)) return false;
      if (sla === 'on_track' && (o.is_sla_breached || o.is_sla_update_due)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.incident_at).getTime() - new Date(a.incident_at).getTime());

  const resetFilters = () => { setSeverity('all'); setStatus('all'); setSla('all'); setSite('all'); setType('all'); };
  const anyFilter = severity !== 'all' || status !== 'all' || sla !== 'all' || site !== 'all' || type !== 'all';

  return (
    <>
      {flash && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand animate-fade-in">
          <Bell className="h-4 w-4" /> {flash}
        </div>
      )}

      {/* KPI strip */}
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="SLA Breached" value={breached.length} accent="border-l-red-500" tone="text-red-600" />
        <KpiCard label="Update Due" value={due.length} accent="border-l-amber-400" tone="text-amber-600" />
        <KpiCard label="On Track" value={onTrack.length} accent="border-l-emerald-500" tone="text-emerald-600" />
        <KpiCard label="Total Open" value={items.length} accent="border-l-brand" tone="text-brand" />
      </div>

      {/* Filter bar */}
      <Card className="mb-5 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <FilterSelect label="Severity" value={severity} onChange={setSeverity}
            options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABELS[s] }))} />
          <FilterSelect label="Status" value={status} onChange={setStatus}
            options={statusOptions.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))} />
          <FilterSelect label="SLA Status" value={sla} onChange={(v) => setSla(v as SlaFilter)}
            options={[{ value: 'breached', label: 'Breached' }, { value: 'due', label: 'Update due' }, { value: 'on_track', label: 'On track' }]} />
          <FilterSelect label="Site" value={site} onChange={setSite}
            options={siteOptions.map((s) => ({ value: s, label: s }))} />
          <FilterSelect label="Type" value={type} onChange={setType}
            options={typeOptions.map((t) => ({ value: t, label: t }))} />
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={resetFilters} disabled={!anyFilter}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
        </div>
      </Card>

      {/* Active occurrences table */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Active Occurrences
            <span className="text-[hsl(var(--muted))]">({filtered.length})</span>
          </h2>
          <Button variant="secondary" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="bg-brand-gradient text-left text-[11px] font-semibold uppercase tracking-wide text-white">
                <th className="px-4 py-2.5">OB #</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Severity</th>
                <th className="px-4 py-2.5">Site</th>
                <th className="px-4 py-2.5">Logged By</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">SLA Timer</th>
                <th className="px-4 py-2.5">Update Timer</th>
                <th className="px-4 py-2.5">Logged</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {filtered.map((o) => {
                const updateTarget = updateDueAt(o);
                const sevColor = SEVERITY_COLORS[o.severity];
                // Base row tint = SLA state (breached/due > severity), with a
                // severity-coloured left rail in all cases. Click anywhere on
                // the row to open the detail page; inline action buttons stop
                // propagation so they still work.
                const slaBgClass = o.is_sla_breached
                  ? 'bg-red-50/60 dark:bg-red-950/30'
                  : o.is_sla_update_due
                    ? 'bg-amber-50/50 dark:bg-amber-950/25'
                    : '';
                return (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/occurrences/${o.id}`)}
                    className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${slaBgClass}`}
                    style={{ borderLeft: `4px solid ${sevColor}` }}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link
                        href={`/occurrences/${o.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-brand hover:underline"
                      >
                        {o.ob_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{o.occurrence_type}</td>
                    <td className="px-4 py-3"><SeverityBadge severity={o.severity} /></td>
                    <td className="whitespace-nowrap px-4 py-3">{o.site_name ?? '—'}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-xs text-[hsl(var(--muted))]" title={o.logged_by_name ?? ''}>
                      {o.logged_by_name ?? '—'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Countdown target={o.sla_due_at} />
                      <p className="mt-0.5 text-[10px] text-[hsl(var(--muted))]">
                        {o.sla_hours ? `${o.sla_hours}hr SLA` : 'SLA'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Countdown target={updateTarget} />
                      <p className="mt-0.5 text-[10px] text-[hsl(var(--muted))]">
                        {o.update_interval_minutes ? `${Math.round(o.update_interval_minutes / 60)}hr updates` : 'updates'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[hsl(var(--muted))]">
                      {fmtDate(o.incident_at)}<br />{fmtTime(o.incident_at)}
                    </td>
                    <td className="px-4 py-3">
                      {/* Wrapper stops row-click navigation when the user
                          taps one of the inline action buttons. */}
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" onClick={() => setTarget(o)}>
                          <PencilLine className="h-3.5 w-3.5" /> Update
                        </Button>
                        <Link href={o.has_report ? `/reports?ob=${o.ob_number}` : `/reports/new?occurrence=${o.id}`}>
                          <Button size="sm" variant="secondary"><FileText className="h-3.5 w-3.5" /> Report</Button>
                        </Link>
                        <Link href={`/occurrences/${o.id}`}>
                          <Button size="sm" variant="secondary"><ScrollText className="h-3.5 w-3.5" /> Logs</Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-[hsl(var(--muted))]">
                    {items.length === 0 ? 'No open occurrences. All clear.' : 'No occurrences match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <UpdateOccurrenceDialog
        open={!!target} onClose={() => setTarget(null)}
        occurrence={target} profile={profile} onDone={refresh}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// When is the next SLA update due? last update (or incident) + interval.
function updateDueAt(o: LiveRow): string | null {
  if (!o.update_interval_minutes) return null;
  const base = o.last_sla_update_at ?? o.incident_at;
  if (!base) return null;
  return new Date(new Date(base).getTime() + o.update_interval_minutes * 60_000).toISOString();
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------------------
// Live HH:MM:SS countdown to a target time. Green while time remains, red and
// negative once overdue. Ticks every second.
function Countdown({ target }: { target: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return <span className="text-[hsl(var(--muted))]">—</span>;
  const ms = new Date(target).getTime() - now;
  const overdue = ms <= 0;
  const total = Math.abs(Math.floor(ms / 1000));
  const hh = String(Math.floor(total / 3600)).padStart(2, '0');
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs font-semibold ${
        overdue
          ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
      }`}
    >
      {overdue && <AlertTriangle className="h-3 w-3" />}
      {overdue ? '-' : ''}{hh}:{mm}:{ss}
    </span>
  );
}

// ---------------------------------------------------------------------------
function KpiCard({ label, value, accent, tone }: { label: string; value: number; accent: string; tone: string }) {
  return (
    <Card className={`border-l-4 ${accent} p-4 text-center`}>
      <p className={`text-3xl font-extrabold ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">{label}</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border bg-[hsl(var(--surface))] px-2 text-sm capitalize outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
      >
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="capitalize">{o.label}</option>
        ))}
      </select>
    </div>
  );
}
