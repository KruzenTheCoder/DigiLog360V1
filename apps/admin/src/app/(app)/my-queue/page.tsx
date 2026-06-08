import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import type { Occurrence } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function MyQueuePage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('occurrences').select('*')
    .eq('assigned_to', profile.id)
    .not('status', 'in', '(resolved,closed)')
    .order('incident_at', { ascending: false })
    .limit(500);

  const rows = (data ?? []) as Occurrence[];

  return (
    <>
      <PageHeader
        title="Assigned to Me"
        description="Occurrences you currently own. Close or reassign once handled."
      />
      <Card className="p-4">
        <Table>
          <THead><TR>
            <TH>OB #</TH><TH>Type</TH><TH>Severity</TH><TH>Status</TH><TH>Site</TH><TH>Incident</TH>
          </TR></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><Link href={`/occurrences/${r.id}`} className="font-medium text-brand hover:underline">{r.ob_number}</Link></TD>
                <TD>{r.occurrence_type}</TD>
                <TD><SeverityBadge severity={r.severity} /></TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD>{r.site_name ?? '—'}</TD>
                <TD className="text-xs text-[hsl(var(--muted))]">{formatDateTime(r.incident_at)}</TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR><TD colSpan={6} className="py-8 text-center text-[hsl(var(--muted))]">
                Nothing in your queue. Nice work.
              </TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
