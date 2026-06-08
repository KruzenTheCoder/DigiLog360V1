import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { MonthlyTrendChart, TypeBreakdownChart, SeverityPie } from '@/components/dashboard/dashboard-charts';
import { isSlaBreached, isSlaUpdateDue, SEVERITIES, SEVERITY_LABELS } from '@digilog/shared';
import type { Occurrence } from '@digilog/shared';

// Minimal projection — exactly the columns the dashboard aggregates over.
// Keeps payloads small on big orgs (thousands of occurrences in 6 months).
type DashboardOcc = Pick<
  Occurrence,
  'id' | 'status' | 'severity' | 'occurrence_type' | 'site_name'
  | 'incident_at' | 'sla_due_at' | 'last_sla_update_at' | 'sla_hours' | 'closed_at'
>;

export const dynamic = 'force-dynamic';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DashboardProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const params = await searchParams;
  const siteParam = typeof params.site === 'string' ? params.site : undefined;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Run the two queries in parallel. The previous version waited on sites
  // first; sequencing them serially added a full round-trip on every page
  // load. Also: select only the columns the dashboard aggregates over —
  // pulling `select('*')` was returning ~25 KB per row × thousands of rows.
  let occQ = supabase
    .from('occurrences')
    .select('id, status, severity, occurrence_type, site_name, incident_at, sla_due_at, last_sla_update_at, sla_hours, closed_at')
    .gte('incident_at', sixMonthsAgo.toISOString())
    .order('incident_at', { ascending: false });
  if (siteParam) occQ = occQ.eq('site_id', siteParam);

  const [{ data: allSites }, { data }] = await Promise.all([
    supabase.from('sites').select('id, name').order('name'),
    occQ,
  ]);
  const activeSite = siteParam ? (allSites ?? []).find((s) => s.id === siteParam) : null;

  const occ = (data ?? []) as DashboardOcc[];
  const now = new Date();
  const todayStr = now.toDateString();
  const last30 = new Date(now.getTime() - 30 * 864e5);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());

  const occ30 = occ.filter((o) => new Date(o.incident_at) >= last30);
  const total30 = occ30.length;
  const today = occ30.filter((o) => new Date(o.incident_at).toDateString() === todayStr).length;
  const thisWeek = occ30.filter((o) => new Date(o.incident_at) >= weekStart).length;
  const open = occ30.filter((o) => o.status === 'open').length;
  const resolved = occ30.filter((o) => o.status === 'resolved' || o.status === 'closed').length;
  const resolutionRate = total30 ? Math.round((resolved / total30) * 100) : 0;
  const breached = occ.filter((o) => isSlaBreached(o, now)).length;
  const updateDue = occ.filter((o) => isSlaUpdateDue(o, now) && !isSlaBreached(o, now)).length;

  // Type breakdown (top 7)
  const typeMap = new Map<string, number>();
  occ30.forEach((o) => typeMap.set(o.occurrence_type, (typeMap.get(o.occurrence_type) ?? 0) + 1));
  const typeBreakdown = [...typeMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);

  // Severity mix
  const severityMix = SEVERITIES.map((key) => ({
    key, name: SEVERITY_LABELS[key], value: occ30.filter((o) => o.severity === key).length,
  })).filter((s) => s.value > 0);

  // Top sites
  const siteMap = new Map<string, number>();
  occ30.forEach((o) => { const s = o.site_name ?? 'Unassigned'; siteMap.set(s, (siteMap.get(s) ?? 0) + 1); });
  const topSites = [...siteMap.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  // Monthly trend (6 months)
  const monthMap = new Map<string, { count: number; breached: number }>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthMap.set(`${d.getFullYear()}-${d.getMonth()}`, { count: 0, breached: 0 });
  }
  occ.forEach((o) => {
    const d = new Date(o.incident_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const slot = monthMap.get(key);
    if (slot) { slot.count++; if (isSlaBreached(o, now)) slot.breached++; }
  });
  const monthly = [...monthMap.entries()].map(([k, v]) => {
    const m = Number(k.split('-')[1]);
    return { month: MONTHS[m], count: v.count, breached: v.breached };
  });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Operational overview — last 30 days${activeSite ? ` · ${activeSite.name}` : profile.role === 'admin' ? ' · all sites' : ''}`}
      />

      {(allSites ?? []).length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[hsl(var(--muted))]">Filter:</span>
          <a
            href="/dashboard"
            className={`rounded-full px-3 py-1 ${!siteParam ? 'bg-brand text-white' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
          >
            All sites
          </a>
          {(allSites ?? []).map((s) => (
            <a
              key={s.id}
              href={`/dashboard?site=${s.id}`}
              className={`rounded-full px-3 py-1 ${siteParam === s.id ? 'bg-brand text-white' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
            >
              {s.name}
            </a>
          ))}
        </div>
      )}

      {(breached > 0 || updateDue > 3) && (
        <div className="mb-5 flex flex-wrap gap-3">
          {breached > 0 && (
            <div className="flex-1 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <strong>{breached}</strong> occurrence(s) have breached their SLA.
            </div>
          )}
          {updateDue > 3 && (
            <div className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <strong>{updateDue}</strong> occurrence(s) require an SLA update.
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Incidents (30d)" value={total30} icon="ClipboardList" hint={`${today} today · ${thisWeek} this week`} tone="brand" />
        <StatCard label="Open" value={open} icon="FolderOpen" tone="default" />
        <StatCard label="SLA Breached" value={breached} icon="AlertTriangle" tone="danger" />
        <StatCard label="Resolution Rate" value={`${resolutionRate}%`} icon="CheckCircle2" hint={`${resolved} resolved`} tone="success" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <MonthlyTrendChart data={monthly} />
        <TypeBreakdownChart data={typeBreakdown} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <SeverityPie data={severityMix} />
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Top Sites</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topSites.length === 0 && <p className="text-sm text-[hsl(var(--muted))]">No data yet.</p>}
            {topSites.map((s) => {
              const pct = total30 ? Math.round((s.count / total30) * 100) : 0;
              return (
                <div key={s.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{s.name}</span>
                    <span className="text-[hsl(var(--muted))]">{s.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
