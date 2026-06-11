import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { MonthlyTrendChart, CategoryDonut, PALETTE } from '@/components/dashboard/dashboard-charts';
import { HeroKpi } from '@/components/dashboard/hero-kpi';
import { SeverityCards } from '@/components/dashboard/severity-cards';
import { SlaComplianceReport } from '@/components/dashboard/sla-compliance';
import {
  isSlaBreached, isSlaUpdateDue, SEVERITIES, SEVERITY_LABELS,
  OCCURRENCE_STATUSES, STATUS_LABELS, STATUS_COLORS,
} from '@digilog/shared';
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
  const last30 = new Date(now.getTime() - 30 * 864e5);
  const last60 = new Date(now.getTime() - 60 * 864e5);
  const occ30 = occ.filter((o) => new Date(o.incident_at) >= last30);
  const total30 = occ30.length;
  const open = occ30.filter((o) => o.status === 'open').length;
  const resolved = occ30.filter((o) => o.status === 'resolved' || o.status === 'closed').length;
  const resolutionRate = total30 ? Math.round((resolved / total30) * 100) : 0;
  const breached = occ.filter((o) => isSlaBreached(o, now)).length;
  const updateDue = occ.filter((o) => isSlaUpdateDue(o, now) && !isSlaBreached(o, now)).length;

  // Previous 30-day window (days 31–60) for the trend delta on the hero card.
  const prevTotal = occ.filter((o) => {
    const d = new Date(o.incident_at);
    return d >= last60 && d < last30;
  }).length;
  const trendPct = prevTotal ? Math.round(((total30 - prevTotal) / prevTotal) * 1000) / 10 : null;

  // Average time-to-close (hours) over occurrences closed in the last 30 days.
  const closed30 = occ30.filter((o) => o.closed_at);
  const avgResolutionHrs = closed30.length
    ? Math.round(
        (closed30.reduce((sum, o) =>
          sum + (new Date(o.closed_at as string).getTime() - new Date(o.incident_at).getTime()), 0)
          / closed30.length) / 36e5,
      )
    : 0;

  // Severity counts for all four levels (including zeros) for the distribution row.
  const severityCounts = SEVERITIES.reduce((acc, key) => {
    acc[key] = occ30.filter((o) => o.severity === key).length;
    return acc;
  }, {} as Record<(typeof SEVERITIES)[number], number>);

  // Status pipeline — where occurrences currently sit in their lifecycle.
  const statusCounts = OCCURRENCE_STATUSES.map((s) => ({
    key: s, label: STATUS_LABELS[s], color: STATUS_COLORS[s],
    count: occ30.filter((o) => o.status === s).length,
  })).filter((s) => s.count > 0);

  // Type breakdown (top 7)
  const typeMap = new Map<string, number>();
  occ30.forEach((o) => typeMap.set(o.occurrence_type, (typeMap.get(o.occurrence_type) ?? 0) + 1));
  const typeBreakdown = [...typeMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);

  // Top sites
  const siteMap = new Map<string, number>();
  occ30.forEach((o) => { const s = o.site_name ?? 'Unassigned'; siteMap.set(s, (siteMap.get(s) ?? 0) + 1); });
  const topSites = [...siteMap.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  // ---- SLA breach analysis & compliance (last 30 days) ----
  // An occurrence "breached" if its end time (close time, or now if still open)
  // is past its SLA due time. Only occurrences with an SLA window are scored.
  const slaEnd = (o: DashboardOcc) =>
    (o.status === 'resolved' || o.status === 'closed') && o.closed_at
      ? new Date(o.closed_at).getTime()
      : now.getTime();
  const breachedEver = (o: DashboardOcc) =>
    !!o.sla_due_at && slaEnd(o) > new Date(o.sla_due_at).getTime();

  const slaScoped = occ30.filter((o) => o.sla_due_at);
  const slaTotal = slaScoped.length;
  const slaBreaches = slaScoped.filter(breachedEver);
  const slaBreachCount = slaBreaches.length;
  const slaWithin = slaTotal - slaBreachCount;
  const complianceRate = slaTotal ? Math.round((slaWithin / slaTotal) * 100) : 100;
  const avgOverageHrs = slaBreachCount
    ? Math.round(
        (slaBreaches.reduce((sum, o) => sum + (slaEnd(o) - new Date(o.sla_due_at as string).getTime()), 0)
          / slaBreachCount) / 36e5 * 10,
      ) / 10
    : 0;

  const slaBySeverity = SEVERITIES.map((sev) => {
    const rows = slaScoped.filter((o) => o.severity === sev);
    const br = rows.filter(breachedEver).length;
    return {
      key: sev, label: SEVERITY_LABELS[sev], total: rows.length, breached: br,
      compliance: rows.length ? Math.round(((rows.length - br) / rows.length) * 100) : 100,
    };
  }).filter((s) => s.total > 0);

  const slaSiteMap = new Map<string, { total: number; breached: number }>();
  slaScoped.forEach((o) => {
    const s = o.site_name ?? 'Unassigned';
    const cur = slaSiteMap.get(s) ?? { total: 0, breached: 0 };
    cur.total++; if (breachedEver(o)) cur.breached++;
    slaSiteMap.set(s, cur);
  });
  const slaBySite = [...slaSiteMap.entries()]
    .map(([name, v]) => ({
      name, total: v.total, breached: v.breached,
      compliance: v.total ? Math.round(((v.total - v.breached) / v.total) * 100) : 100,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

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
        title="Performance Dashboard"
        description={`Real-time analytics & key performance indicators — last 30 days${activeSite ? ` · ${activeSite.name}` : profile.role === 'admin' ? ' · all sites' : ''}`}
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

      {/* Hero KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <HeroKpi
          tone="red"
          icon="TriangleAlert"
          label="Total Incidents"
          sublabel="Last 30 days"
          value={total30}
          footer={
            trendPct === null
              ? <span>No prior period</span>
              : trendPct === 0
                ? <span>No change vs previous period</span>
                : <span>{trendPct < 0 ? '↓' : '↑'} {Math.abs(trendPct)}% vs previous period</span>
          }
        />
        <HeroKpi
          tone="blue"
          icon="ShieldAlert"
          label="Highest Risk"
          sublabel="Category"
          value={typeBreakdown[0]?.name ?? '—'}
          footer={`${typeBreakdown[0]?.count ?? 0} incidents logged`}
        />
        <HeroKpi
          tone={avgResolutionHrs <= 4 ? 'green' : 'red'}
          icon="Clock"
          label="Avg Resolution"
          sublabel="Time to close"
          value={`${avgResolutionHrs} Hrs`}
          footer={avgResolutionHrs <= 4 ? '✓ Within 4h target' : '⚠ Over 4h target'}
        />
      </div>

      {/* Quick operational counters */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Open / Live', value: open, accent: 'bg-amber-400' },
          { label: 'Resolved / Closed', value: resolved, accent: 'bg-emerald-400' },
          { label: 'SLA Breached', value: breached, accent: 'bg-red-400' },
          { label: 'Resolution Rate', value: `${resolutionRate}%`, accent: 'bg-brand' },
        ].map((c) => (
          <Card key={c.label} className="flex items-stretch overflow-hidden p-0">
            <span className={`w-1.5 shrink-0 ${c.accent}`} />
            <div className="px-4 py-3">
              <p className="text-2xl font-extrabold leading-tight">{c.value}</p>
              <p className="text-xs text-[hsl(var(--muted))]">{c.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Status pipeline */}
      {statusCounts.length > 0 && (
        <Card className="mt-5">
          <CardHeader><CardTitle>Status Pipeline</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-3.5 w-full overflow-hidden rounded-full">
              {statusCounts.map((s) => (
                <div
                  key={s.key}
                  style={{ width: `${(s.count / total30) * 100}%`, background: s.color }}
                  title={`${s.label}: ${s.count}`}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {statusCounts.map((s) => {
                const pct = total30 ? Math.round((s.count / total30) * 100) : 0;
                return (
                  <span key={s.key} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                    {s.label}
                    <span className="font-semibold text-[hsl(var(--foreground))]">{s.count}</span>
                    <span className="text-[hsl(var(--muted))]">({pct}%)</span>
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category breakdown + high-frequency incidents */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <CategoryDonut data={typeBreakdown} />
        <Card className="h-full">
          <CardHeader><CardTitle>High-Frequency Incidents</CardTitle></CardHeader>
          <CardContent className="space-y-3.5">
            {typeBreakdown.length === 0 && <p className="text-sm text-[hsl(var(--muted))]">No data yet.</p>}
            {typeBreakdown.map((t, i) => {
              const pct = total30 ? Math.round((t.count / total30) * 100) : 0;
              const color = PALETTE[i % PALETTE.length];
              return (
                <div key={t.name} className="flex items-center gap-3">
                  {/* Rank badge */}
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                    style={{ background: color }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{t.name}</span>
                      <span className="shrink-0 text-xs text-[hsl(var(--muted))]">
                        <span className="font-semibold text-[hsl(var(--foreground))]">{t.count}</span> · {pct}%
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, ${color}bb, ${color})` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Volume by site + monthly trend */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader><CardTitle>Occurrence Volume by Site</CardTitle></CardHeader>
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
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <MonthlyTrendChart data={monthly} />
      </div>

      {/* Severity distribution */}
      <div className="mt-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
          Severity Distribution
        </h2>
        <SeverityCards counts={severityCounts} />
      </div>

      {/* SLA breach analysis & compliance tracking */}
      <div className="mt-5">
        <SlaComplianceReport
          complianceRate={complianceRate}
          within={slaWithin}
          breached={slaBreachCount}
          total={slaTotal}
          avgOverageHrs={avgOverageHrs}
          bySeverity={slaBySeverity}
          bySite={slaBySite}
        />
      </div>
    </>
  );
}
