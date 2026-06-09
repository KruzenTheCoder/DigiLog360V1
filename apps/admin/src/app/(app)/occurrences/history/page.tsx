import Link from 'next/link';
import { ArrowLeft, Radio } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { HistoryOccurrences, type HistoryRow } from '@/components/occurrences/history-occurrences';
import { formatDateTime } from '@/lib/utils';
import type { PatrolDetailed } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: closed }, { data: patrols }] = await Promise.all([
    supabase.from('occurrences')
      .select('id, ob_number, occurrence_type, severity, status, site_name, logged_by_name, incident_at, closed_at, description')
      .in('status', ['resolved', 'closed'])
      .order('closed_at', { ascending: false }).limit(500),
    supabase.from('patrols_detailed').select('*')
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false }).limit(200),
  ]);

  const occ = (closed ?? []) as unknown as HistoryRow[];
  const pat = (patrols ?? []) as PatrolDetailed[];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History — Closed Occurrences &amp; Completed Patrols</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">Resolved occurrences and completed patrols.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/occurrences">
            <Button variant="secondary"><Radio className="h-4 w-4" /> View Live Occurrences</Button>
          </Link>
          <Link href="/menu">
            <Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back to Menu</Button>
          </Link>
        </div>
      </div>

      <HistoryOccurrences rows={occ} />

      <Card className="mt-5">
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
