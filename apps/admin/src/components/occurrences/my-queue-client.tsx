'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCachedQuery } from '@/lib/use-cached-query';
import { GradientSection } from '@/components/ui/gradient-section';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { usePagedRows, Pager } from '@/components/ui/pager';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { SEVERITY_COLORS, isSlaBreached, type Occurrence } from '@digilog/shared';

/** Client-cached "Assigned to me" queue — instant on revisit. */
export function MyQueueClient({ userId }: { userId: string }) {
  const router = useRouter();
  const { data, loading, refresh } = useCachedQuery<Occurrence[]>(
    `my-queue:${userId}`,
    async () => {
      const sb = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sb as any)
        .from('occurrences').select('*')
        .eq('assigned_to', userId)
        .not('status', 'in', '(resolved,closed)')
        .order('incident_at', { ascending: false })
        .limit(500);
      return (data ?? []) as Occurrence[];
    },
    { staleMs: 15_000 },
  );

  // Live updates: re-fetch when any occurrence changes (assignment, status, new
  // incident). Cheap re-query keeps "Assigned to me" current without a refresh.
  useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`my-queue-live:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences' }, () => refresh())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [userId, refresh]);

  const rows = data ?? [];
  const pg = usePagedRows(rows, 50);

  if (loading && !data) {
    return <div className="h-96 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />;
  }

  return (
    <GradientSection title="Assigned to Me" subtitle="Open occurrences assigned to you" icon="Inbox" tone="sky">
      <Table>
        <THead><TR>
          <TH>OB #</TH><TH>Type</TH><TH>Severity</TH><TH>Status</TH><TH>Site</TH><TH>Incident</TH>
        </TR></THead>
        <TBody>
          {pg.pageRows.map((r) => {
            const breached = isSlaBreached(r);
            const railColor = breached ? '#dc2626' : SEVERITY_COLORS[r.severity];
            return (
              <TR
                key={r.id}
                onClick={() => router.push(`/occurrences/${r.id}`)}
                className="cursor-pointer"
                style={{
                  borderLeft: `5px solid ${railColor}`,
                  background: `linear-gradient(90deg, ${railColor}${breached ? '40' : '33'} 0%, ${railColor}${breached ? '1f' : '14'} 100%)`,
                }}
              >
                <TD><Link href={`/occurrences/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand hover:underline">{r.ob_number}</Link></TD>
                <TD>{r.occurrence_type}</TD>
                <TD><SeverityBadge severity={r.severity} /></TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD>{r.site_name ?? '—'}</TD>
                <TD className="text-xs text-[hsl(var(--muted))]">{formatDateTime(r.incident_at)}</TD>
              </TR>
            );
          })}
          {rows.length === 0 && (
            <TR><TD colSpan={6} className="py-8 text-center text-[hsl(var(--muted))]">
              Nothing in your queue. Nice work.
            </TD></TR>
          )}
        </TBody>
      </Table>
      <Pager {...pg} />
    </GradientSection>
  );
}
