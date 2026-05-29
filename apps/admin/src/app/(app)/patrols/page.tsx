import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EndPatrolButton } from '@/components/patrols/end-patrol-button';
import { formatDateTime } from '@/lib/utils';
import type { PatrolDetailed } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function PatrolsPage() {
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from('patrols_detailed').select('*')
    .order('started_at', { ascending: false }).limit(200);
  const patrols = (data ?? []) as PatrolDetailed[];
  const active = patrols.filter((p) => p.status === 'active');
  const recent = patrols.filter((p) => p.status !== 'active');

  return (
    <>
      <PageHeader title="Patrols" description="Live patrol monitoring and checkpoint progress." />

      <Card className="mb-5">
        <CardHeader><CardTitle>Active Patrols ({active.length})</CardTitle></CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted))]">No patrols in progress.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((p) => (
                <Card key={p.id} className="border-teal-300 p-4 dark:border-teal-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.guard_name}</span>
                    <Badge color="#14b8a6">In progress</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[hsl(var(--muted))]">{p.route_name ?? 'Ad-hoc patrol'} · {p.site_name ?? '—'}</p>
                  <p className="mt-2 text-sm">Checkpoints scanned: <strong>{p.scan_count}{p.checkpoints_total ? ` / ${p.checkpoints_total}` : ''}</strong></p>
                  <p className="text-xs text-[hsl(var(--muted))]">Started {formatDateTime(p.started_at)}</p>
                  <div className="mt-3 flex justify-end">
                    <EndPatrolButton patrolId={p.id} occurrenceId={p.occurrence_id} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Patrols</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Guard</TH><TH>Route</TH><TH>Site</TH><TH>Status</TH><TH>Checkpoints</TH><TH>Duration</TH><TH>Started</TH></TR></THead>
            <TBody>
              {recent.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.guard_name}</TD>
                  <TD>{p.route_name ?? '—'}</TD>
                  <TD>{p.site_name ?? '—'}</TD>
                  <TD><Badge color={p.status === 'completed' ? '#16a34a' : '#64748b'}>{p.status}</Badge></TD>
                  <TD>{p.scan_count}</TD>
                  <TD>{p.duration_minutes != null ? `${p.duration_minutes} min` : '—'}</TD>
                  <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">{formatDateTime(p.started_at)}</TD>
                </TR>
              ))}
              {recent.length === 0 && <TR><TD colSpan={7} className="py-6 text-center text-[hsl(var(--muted))]">No patrol history.</TD></TR>}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
