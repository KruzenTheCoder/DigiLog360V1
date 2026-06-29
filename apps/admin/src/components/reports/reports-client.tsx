'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCachedQuery } from '@/lib/use-cached-query';
import { ReportsTable } from '@/components/reports/reports-table';
import type { OccurrenceReport } from '@digilog/shared';

/**
 * Client-cached Reports list.
 *
 * Fetches in the browser via useCachedQuery so the data SURVIVES navigation:
 * the first visit shows a short skeleton, every revisit renders instantly from
 * cache and revalidates in the background. This removes the per-navigation
 * server round-trip "freeze" for SA users hitting a US backend.
 *
 * Site scope is enforced here too: occurrence_reports has no site_id, so for
 * scoped roles we first resolve the occurrence ids at the user's sites, then
 * filter reports to those. (RLS still guarantees org isolation regardless.)
 */
export function ReportsClient({
  ownSites, isUnscoped,
}: {
  ownSites: string[];
  isUnscoped: boolean;
}) {
  const scoped = !isUnscoped && ownSites.length > 0;
  const cacheKey = `reports:${isUnscoped ? 'all' : ownSites.slice().sort().join(',') || 'none'}`;

  const { data, loading, refresh } = useCachedQuery<OccurrenceReport[]>(
    cacheKey,
    async () => {
      const sb = createClient();
      let allowedIds: number[] | null = null;
      if (scoped) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: occs } = await (sb as any).from('occurrences').select('id').in('site_id', ownSites);
        allowedIds = (occs ?? []).map((o: { id: number }) => o.id);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (sb as any).from('occurrence_reports').select('*')
        .order('created_at', { ascending: false }).limit(500);
      if (allowedIds !== null) {
        q = allowedIds.length > 0 ? q.in('occurrence_id', allowedIds) : q.eq('occurrence_id', -1);
      }
      const { data: rows } = await q;
      return (rows ?? []) as OccurrenceReport[];
    },
    { staleMs: 20_000 },
  );

  // Live updates: re-fetch when a report is created/changed by anyone.
  useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel('reports-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrence_reports' }, () => refresh())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [refresh]);

  if (loading && !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-28 rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
        <div className="h-96 rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
      </div>
    );
  }

  return <ReportsTable reports={data ?? []} />;
}
