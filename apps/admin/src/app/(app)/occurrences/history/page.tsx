import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import type { Occurrence, PatrolDetailed } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: closed }, { data: patrols }] = await Promise.all([
    supabase.from('occurrences').select('*')
      .in('status', ['resolved', 'closed'])
      .order('closed_at', { ascending: false }).limit(500),
    supabase.from('patrols_detailed').select('*')
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false }).limit(200),
  ]);

  const occ = (closed ?? []) as Occurrence[];
  const pat = (patrols ?? []) as PatrolDetailed[];

  return (
    <>
      <PageHeader title="History" description="Resolved occurrences and completed patrols." />

      <Card className="mb-5">
        <CardHeader><CardTitle>Closed Occurrences ({occ.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>OB #</TH><TH>Type</TH><TH>Severity</TH><TH>Status</TH><TH>Site</TH><TH>Closed</TH></TR></THead>
            <TBody>
              {occ.map((o) => (
                <TR key={o.id}>
                  <TD><Link href={`/occurrences/${o.id}`} className="font-medium text-brand hover:underline">{o.ob_number}</Link></TD>
                  <TD>{o.occurrence_type}</TD>
                  <TD><SeverityBadge severity={o.severity} /></TD>
                  <TD><StatusBadge status={o.status} /></TD>
                  <TD>{o.site_name ?? '—'}</TD>
                  <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">{formatDateTime(o.closed_at)}</TD>
                </TR>
              ))}
              {occ.length === 0 && <TR><TD colSpan={6} className="py-6 text-center text-[hsl(var(--muted))]">No closed occurrences.</TD></TR>}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Completed Patrols ({pat.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Guard</TH><TH>Route</TH><TH>Site</TH><TH>Checkpoints</TH><TH>Duration</TH><TH>Ended</TH></TR></THead>
            <TBody>
              {pat.map((p) => (
                <TR key={p.id}>
                  <TD className="font-medium">{p.guard_name}</TD>
                  <TD>{p.route_name ?? '—'}</TD>
                  <TD>{p.site_name ?? '—'}</TD>
                  <TD>{p.scan_count}{p.checkpoints_total ? ` / ${p.checkpoints_total}` : ''}</TD>
                  <TD>{p.duration_minutes != null ? `${p.duration_minutes} min` : '—'}</TD>
                  <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">{formatDateTime(p.ended_at)}</TD>
                </TR>
              ))}
              {pat.length === 0 && <TR><TD colSpan={6} className="py-6 text-center text-[hsl(var(--muted))]">No completed patrols.</TD></TR>}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
