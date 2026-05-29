import Link from 'next/link';
import { Printer, Eye } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import type { OccurrenceReport } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from('occurrence_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  const reports = (data ?? []) as OccurrenceReport[];

  return (
    <>
      <PageHeader title="Occurrence Reports" description="Detailed incident reports — view or export to PDF." />
      <Card className="p-4">
        <Table>
          <THead>
            <TR><TH>OB #</TH><TH>Type</TH><TH>Severity</TH><TH>Status</TH><TH>Created By</TH><TH>Created</TH><TH></TH></TR>
          </THead>
          <TBody>
            {reports.map((r) => (
              <TR key={r.id}>
                <TD className="font-medium">{r.ob_number}</TD>
                <TD>{r.occurrence_type}</TD>
                <TD>{r.severity && <SeverityBadge severity={r.severity} />}</TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD>{r.created_by_name ?? '—'}</TD>
                <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">{formatDateTime(r.created_at)}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Link href={`/occurrences/${r.occurrence_id}`}>
                      <Button variant="ghost" size="icon" title="View"><Eye className="h-4 w-4" /></Button>
                    </Link>
                    <Link href={`/print/report/${r.ob_number}`} target="_blank">
                      <Button variant="ghost" size="icon" title="Print / PDF"><Printer className="h-4 w-4" /></Button>
                    </Link>
                  </div>
                </TD>
              </TR>
            ))}
            {reports.length === 0 && (
              <TR><TD colSpan={7} className="py-8 text-center text-[hsl(var(--muted))]">No reports yet. Create one from a live occurrence.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
