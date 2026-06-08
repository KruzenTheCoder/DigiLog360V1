'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Clock, CheckCircle2, RefreshCw, FileText, Bell,
  LayoutGrid, List,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { UpdateOccurrenceDialog } from './update-dialog';
import { formatTimeRemaining, type LiveOccurrence, type Profile } from '@digilog/shared';
import { formatDateTime } from '@/lib/utils';

type ViewMode = 'grid' | 'list';
const VIEW_MODE_KEY = 'digilog.live-board.view-mode';

export function LiveBoard({ initial, profile }: { initial: LiveOccurrence[]; profile: Profile }) {
  const [items, setItems] = useState<LiveOccurrence[]>(initial);
  const [target, setTarget] = useState<LiveOccurrence | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // View mode persists across sessions per-device.
  const [view, setView] = useState<ViewMode>('grid');

  // Hydrate the saved view mode after mount (avoids SSR/CSR mismatch).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    if (saved === 'grid' || saved === 'list') setView(saved);
  }, []);
  function setViewPersisted(next: ViewMode) {
    setView(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_MODE_KEY, next);
    }
  }

  const refresh = useCallback(async () => {
    const supabase = createClient();
    // Explicit column list — the live view has a lot of columns the board
    // doesn't render (geocoded location, audit metadata, etc.). Selecting
    // only what we display keeps the realtime refresh round-trip small.
    const { data } = await supabase.from('occurrences_live')
      .select('id, ob_number, occurrence_type, description, severity, status, site_name, logged_by_name, incident_at, is_sla_breached, is_sla_update_due, minutes_remaining, has_report')
      .order('incident_at', { ascending: false });
    if (data) setItems(data as LiveOccurrence[]);
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

    const tick = setInterval(refresh, 60_000); // keep SLA timers fresh
    return () => { supabase.removeChannel(channel); clearInterval(tick); };
  }, [refresh]);

  const breached = items.filter((o) => o.is_sla_breached);
  const due = items.filter((o) => o.is_sla_update_due && !o.is_sla_breached);
  const onTrack = items.filter((o) => !o.is_sla_breached && !o.is_sla_update_due);

  // Newest first. SLA-breached items still visually pop via red border /
  // pulse-ring, so triage signal isn't lost — but the chronological order
  // is what operators expect when scanning a live feed.
  const sorted = [...items].sort((a, b) =>
    new Date(b.incident_at).getTime() - new Date(a.incident_at).getTime());

  return (
    <>
      {flash && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-brand animate-fade-in">
          <Bell className="h-4 w-4" /> {flash}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open" value={items.length} icon="Radio" tone="brand" />
        <StatCard label="SLA Breached" value={breached.length} icon="AlertTriangle" tone="danger" />
        <StatCard label="Update Due" value={due.length} icon="Clock" tone="warning" />
        <StatCard label="On Track" value={onTrack.length} icon="CheckCircle2" tone="success" />
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <ViewToggle value={view} onChange={setViewPersisted} />
        <Button variant="secondary" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Card className="p-10 text-center text-[hsl(var(--muted))]">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
          No open occurrences. All clear.
        </Card>
      ) : view === 'grid' ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((o) => (
            <Card
              key={o.id}
              className={`p-4 ${o.is_sla_breached ? 'border-red-300 animate-pulse-ring dark:border-red-800' : o.is_sla_update_due ? 'border-amber-300 dark:border-amber-800' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={`/occurrences/${o.id}`} className="font-semibold hover:text-brand">
                  {o.ob_number}
                </Link>
                <div className="flex flex-wrap justify-end gap-1">
                  <SeverityBadge severity={o.severity} />
                  <StatusBadge status={o.status} />
                </div>
              </div>
              <p className="mt-1 text-sm font-medium">{o.occurrence_type}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-[hsl(var(--muted))]">{o.description}</p>

              <div className="mt-3 flex items-center justify-between text-xs text-[hsl(var(--muted))]">
                <span>{o.site_name ?? '—'} · {o.logged_by_name ?? '—'}</span>
                <span className={o.is_sla_breached ? 'font-semibold text-red-600' : ''}>
                  {o.is_sla_breached
                    ? <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {formatTimeRemaining(o.minutes_remaining)}</span>
                    : <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {formatTimeRemaining(o.minutes_remaining)}</span>}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">{formatDateTime(o.incident_at)}</p>

              <div className="mt-3 flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => setTarget(o)}>Update</Button>
                <Link href={o.has_report ? `/reports?ob=${o.ob_number}` : `/reports/new?occurrence=${o.id}`} className="flex-1">
                  <Button size="sm" variant="secondary" className="w-full">
                    <FileText className="h-4 w-4" /> {o.has_report ? 'Report' : 'Add Report'}
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="hidden grid-cols-[110px_minmax(0,1fr)_120px_140px_140px_220px] gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-alt))] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted))] md:grid">
            <span>OB#</span>
            <span>Type / description</span>
            <span>Severity</span>
            <span>Site</span>
            <span>SLA</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-[hsl(var(--border))]">
            {sorted.map((o) => (
              <li
                key={o.id}
                className={`grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-[hsl(var(--surface-alt))] md:grid-cols-[110px_minmax(0,1fr)_120px_140px_140px_220px] md:items-center md:gap-3 ${
                  o.is_sla_breached
                    ? 'bg-red-50/40 dark:bg-red-950/20'
                    : o.is_sla_update_due
                      ? 'bg-amber-50/30 dark:bg-amber-950/20'
                      : ''
                }`}
              >
                <Link
                  href={`/occurrences/${o.id}`}
                  className="font-semibold hover:text-brand"
                >
                  {o.ob_number}
                </Link>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{o.occurrence_type}</p>
                  <p className="truncate text-xs text-[hsl(var(--muted))]">{o.description}</p>
                  <p className="mt-0.5 text-[11px] text-[hsl(var(--muted))] md:hidden">
                    {o.site_name ?? '—'} · {formatDateTime(o.incident_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <SeverityBadge severity={o.severity} />
                  <StatusBadge status={o.status} />
                </div>
                <span className="hidden truncate text-xs text-[hsl(var(--muted))] md:inline">
                  {o.site_name ?? '—'}
                </span>
                <span
                  className={`hidden text-xs md:inline ${
                    o.is_sla_breached ? 'font-semibold text-red-600' : 'text-[hsl(var(--muted))]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {o.is_sla_breached ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    {formatTimeRemaining(o.minutes_remaining)}
                  </span>
                </span>
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={() => setTarget(o)}>
                    Update
                  </Button>
                  <Link
                    href={
                      o.has_report
                        ? `/reports?ob=${o.ob_number}`
                        : `/reports/new?occurrence=${o.id}`
                    }
                  >
                    <Button size="sm" variant="secondary">
                      <FileText className="h-4 w-4" />
                      {o.has_report ? 'Report' : 'Add'}
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <UpdateOccurrenceDialog
        open={!!target} onClose={() => setTarget(null)}
        occurrence={target} profile={profile} onDone={refresh}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Segmented control for grid / list view.
// ---------------------------------------------------------------------------
function ViewToggle({
  value, onChange,
}: { value: ViewMode; onChange: (next: ViewMode) => void }) {
  const baseBtn =
    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors';
  const active = 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm';
  const inactive = 'text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]';
  return (
    <div
      role="radiogroup"
      aria-label="View"
      className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-alt))] p-1"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === 'grid'}
        onClick={() => onChange('grid')}
        className={`${baseBtn} ${value === 'grid' ? active : inactive}`}
      >
        <LayoutGrid className="h-4 w-4" /> Cards
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'list'}
        onClick={() => onChange('list')}
        className={`${baseBtn} ${value === 'list' ? active : inactive}`}
      >
        <List className="h-4 w-4" /> List
      </button>
    </div>
  );
}
