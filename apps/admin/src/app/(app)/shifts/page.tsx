import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { StatCard } from '@/components/stat-card';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface ShiftRow {
  id: string; user_name: string | null; site_id: string | null; site_name: string | null;
  started_at: string; ended_at: string | null; duration_minutes: number | null; notes: string | null;
}

export default async function ShiftsPage() {
  await requireProfile();
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('shifts').select('*')
    .order('started_at', { ascending: false }).limit(500);

  const rows = (data ?? []) as ShiftRow[];
  const open = rows.filter((r) => !r.ended_at);
  const closed = rows.filter((r) => r.ended_at);

  // last 7 days totals
  const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last7Closed = closed.filter((r) => r.ended_at && new Date(r.ended_at) >= last7);
  const totalMinutes = last7Closed.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);

  return (
    <>
      <PageHeader title="Shifts" description="Who is on shift and how the team's hours roll up." />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="On shift now" value={open.length} icon="Clock" tone="success" />
        <StatCard label="Shifts (7d)" value={last7Closed.length} icon="CalendarDays" />
        <StatCard label="Hours (7d)" value={Math.round(totalMinutes / 60)} icon="Hourglass" />
        <StatCard label="Avg shift" value={last7Closed.length > 0 ? Math.round(totalMinutes / last7Closed.length / 60 * 10) / 10 + 'h' : '—'} icon="Activity" />
      </div>

      <Card className="mb-5 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          On shift now
        </p>
        <Table>
          <THead><TR><TH>Name</TH><TH>Site</TH><TH>Started</TH><TH></TH></TR></THead>
          <TBody>
            {open.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.user_name ?? '—'}</TD>
                <TD>{s.site_name ?? '—'}</TD>
                <TD className="text-xs">{formatDateTime(s.started_at)}</TD>
                <TD><Badge color="#16a34a">Active</Badge></TD>
              </TR>
            ))}
            {open.length === 0 && (
              <TR><TD colSpan={4} className="py-6 text-center text-[hsl(var(--muted))]">Nobody on shift.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          Recent shifts
        </p>
        <Table>
          <THead><TR><TH>Name</TH><TH>Site</TH><TH>Started</TH><TH>Ended</TH><TH>Duration</TH><TH>Notes</TH></TR></THead>
          <TBody>
            {closed.slice(0, 100).map((s) => (
              <TR key={s.id}>
                <TD>{s.user_name ?? '—'}</TD>
                <TD>{s.site_name ?? '—'}</TD>
                <TD className="text-xs">{formatDateTime(s.started_at)}</TD>
                <TD className="text-xs">{formatDateTime(s.ended_at)}</TD>
                <TD>{s.duration_minutes ? `${Math.round(s.duration_minutes / 60 * 10) / 10}h` : '—'}</TD>
                <TD className="max-w-md truncate text-xs">{s.notes ?? '—'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
