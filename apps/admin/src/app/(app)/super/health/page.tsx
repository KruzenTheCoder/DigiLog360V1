import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { SeverityBadge, StatusBadge, Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { isSlaBreached } from '@digilog/shared';
import type { LiveOccurrence, Organization } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function PlatformHealthPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const now = new Date();
  const last24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    { data: orgs },
    { count: usersCount },
    { count: sitesCount },
    { count: occLastDayCount },
    { data: live },
    { data: recent },
  ] = await Promise.all([
    sb.from('organizations').select('*'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('sites').select('*', { count: 'exact', head: true }),
    supabase.from('occurrences').select('*', { count: 'exact', head: true })
      .gte('created_at', last24.toISOString()),
    supabase.from('occurrences_live').select('*').order('incident_at', { ascending: false }).limit(15),
    supabase.from('occurrences').select('*').order('created_at', { ascending: false }).limit(20),
  ]);

  const liveItems = (live ?? []) as LiveOccurrence[];
  const breached = liveItems.filter((o) => o.is_sla_breached).length;
  const orgList = (orgs ?? []) as unknown as Organization[];
  const activeOrgs = orgList.filter((o) => o.is_active).length;

  return (
    <>
      <PageHeader title="Platform Health" description="System-wide telemetry across every tenant." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Organisations" value={orgList.length} icon="Building" tone="brand" hint={`${activeOrgs} active`} />
        <StatCard label="Users" value={usersCount ?? 0} icon="Users2" />
        <StatCard label="Sites" value={sitesCount ?? 0} icon="MapPin" />
        <StatCard label="Occ. (24h)" value={occLastDayCount ?? 0} icon="ClipboardList" />
        <StatCard label="SLA Breached" value={breached} icon="AlertTriangle" tone="danger" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Cross-org live occurrences</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>OB #</TH><TH>Type</TH><TH>Severity</TH><TH>Status</TH><TH>SLA</TH></TR></THead>
              <TBody>
                {liveItems.map((o) => (
                  <TR key={o.id}>
                    <TD className="font-medium">{o.ob_number}</TD>
                    <TD>{o.occurrence_type}</TD>
                    <TD><SeverityBadge severity={o.severity} /></TD>
                    <TD><StatusBadge status={o.status} /></TD>
                    <TD>{o.is_sla_breached
                      ? <Badge color="#dc2626">Breached</Badge>
                      : o.is_sla_update_due
                      ? <Badge color="#ea580c">Due</Badge>
                      : <Badge color="#16a34a">OK</Badge>}</TD>
                  </TR>
                ))}
                {liveItems.length === 0 && (
                  <TR><TD colSpan={5} className="py-6 text-center text-[hsl(var(--muted))]">No live occurrences.</TD></TR>
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Latest activity</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>OB #</TH><TH>Severity</TH><TH>Site</TH><TH>When</TH></TR></THead>
              <TBody>
                {(recent ?? []).map((o) => {
                  const breached = isSlaBreached(o, now);
                  return (
                    <TR key={o.id}>
                      <TD className="font-medium">{o.ob_number}</TD>
                      <TD><SeverityBadge severity={o.severity} /></TD>
                      <TD className="text-xs">{o.site_name ?? '—'}</TD>
                      <TD className={`whitespace-nowrap text-xs ${breached ? 'text-red-600' : 'text-[hsl(var(--muted))]'}`}>
                        {formatDateTime(o.created_at)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
