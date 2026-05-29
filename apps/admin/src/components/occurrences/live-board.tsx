'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, CheckCircle2, RefreshCw, FileText, Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { UpdateOccurrenceDialog } from './update-dialog';
import { formatTimeRemaining, type LiveOccurrence, type Profile } from '@digilog/shared';
import { formatDateTime } from '@/lib/utils';

export function LiveBoard({ initial, profile }: { initial: LiveOccurrence[]; profile: Profile }) {
  const [items, setItems] = useState<LiveOccurrence[]>(initial);
  const [target, setTarget] = useState<LiveOccurrence | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from('occurrences_live').select('*')
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

  // Breached first, then update-due, then newest.
  const sorted = [...items].sort((a, b) =>
    Number(b.is_sla_breached) - Number(a.is_sla_breached) ||
    Number(b.is_sla_update_due) - Number(a.is_sla_update_due) ||
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

      <div className="mb-3 flex justify-end">
        <Button variant="secondary" size="sm" onClick={refresh}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Card className="p-10 text-center text-[hsl(var(--muted))]">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
          No open occurrences. All clear.
        </Card>
      ) : (
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
      )}

      <UpdateOccurrenceDialog
        open={!!target} onClose={() => setTarget(null)}
        occurrence={target} profile={profile} onDone={refresh}
      />
    </>
  );
}
