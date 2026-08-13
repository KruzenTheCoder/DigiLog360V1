import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isManager } from '@/lib/auth';
import { siteScope } from '@/lib/site-scope';
import { PageHeader } from '@/components/page-header';
import { GradientSection } from '@/components/ui/gradient-section';
import { HeroKpi } from '@/components/dashboard/hero-kpi';
import { SeverityCards } from '@/components/dashboard/severity-cards';
import {
  CategoryDonut, MonthlyTrendChart,
} from '@/components/dashboard/dashboard-charts';
import { SlaComplianceReport } from '@/components/dashboard/sla-compliance';
import { RolePerformanceTable, type RolePerfRow } from '@/components/manager/role-performance';
import { StaffReports } from '@/components/manager/staff-reports';
import {
  APP_ROLES, SEVERITIES, SEVERITY_LABELS, isSlaBreached, isSlaUpdateDue, TERMINAL_STATUSES,
  type AppRole, type SeverityLevel,
} from '@digilog/shared';

export const dynamic = 'force-dynamic';

// Local palette — `PALETTE` from the charts module is a `'use client'` export,
// so its values aren't readable in this server component (becomes a client
// reference). Define it here so the bar colours resolve server-side.
const BAR_PALETTE = ['#667eea', '#764ba2', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6'];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DashboardOcc {
  id: number;
  // Stored DB enums — typed as plain string here so we can cast freely from
  // the generated-types-aware fetch without dragging the union all over.
  status: string;
  severity: SeverityLevel;
  occurrence_type: string;
  site_id: string | null;
  site_name: string | null;
  incident_at: string;
  closed_at: string | null;
  sla_due_at: string | null;
  last_sla_update_at: string | null;
  sla_hours: number | null;
  logged_by: string | null;
  assigned_to: string | null;
  [key: string]: unknown;
}

interface AckLiteRow extends AckLite {
  [key: string]: unknown;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  roles: AppRole[] | null;
  site_id: string | null;
}

interface AckLite {
  reviewed_by: string | null;
  reviewed_at: string;
  occurrence_id: number;
}

// We need an index signature on the row type passed to the StaffReports
// per-user table so its CSV exporter is happy.
interface UserStats {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  roles: AppRole[];
  site_name: string | null;
  occurrences: number;
  occurrences_open: number;
  occurrences_closed: number;
  patrols: number;
  patrol_minutes: number;
  scans: number;
  shifts: number;
  shift_minutes: number;
  acknowledgements: number;
  tasks_open: number;
  tasks_done: number;
  [key: string]: unknown;
}

export default async function StaffReportsPage({ searchParams }: PageProps) {
  const profile = await requireProfile();
  if (!isManager(profile)) redirect('/dashboard');

  const params = await searchParams;
  const roleFilter = (typeof params.role === 'string' ? params.role : 'all') as AppRole | 'all';
  const days = Math.min(365, Math.max(1, Number(params.days) || 30));

  const supabase = await createClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date();

  // Site scope — admin / super_user (any held role) see everything; everyone
  // else is restricted to the sites they're assigned to.
  const { ownSites, isUnscoped } = siteScope(profile);
  const scopeSites = !isUnscoped && ownSites.length > 0 ? ownSites : null;

  // ----------------------------- core data -----------------------------------

  // Generated types lag behind a few recently-added columns (assigned_to,
  // etc.) — route through `any` so the page-level types stay clean.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;
  let occQ = sb
    .from('occurrences')
    .select('id, status, severity, occurrence_type, site_id, site_name, incident_at, closed_at, sla_due_at, last_sla_update_at, sla_hours, logged_by, assigned_to')
    .gte('incident_at', since)
    .order('incident_at', { ascending: false });
  if (scopeSites) occQ = occQ.in('site_id', scopeSites);
  // Site-less scoped user → own rows only (unfiltered would time out on RLS).
  else if (!isUnscoped) occQ = occQ.eq('logged_by', profile.id);

  const [
    { data: occRaw },
    { data: profilesRaw },
    { data: sites },
    { data: acksRaw },
    { data: patrolsRaw },
    { data: scansRaw },
    { data: shiftsRaw },
    { data: tasksRaw },
  ] = await Promise.all([
    occQ,
    sb.from('profiles').select('id, full_name, email, role, roles, site_id'),
    sb.from('sites').select('id, name'),
    sb.from('manager_acknowledgements').select('reviewed_by, reviewed_at, occurrence_id').gte('reviewed_at', since),
    sb.from('patrols').select('id, guard_id, duration_minutes, started_at').gte('started_at', since),
    sb.from('checkpoint_scans').select('id, guard_id, scanned_at').gte('scanned_at', since),
    sb.from('shifts').select('id, user_id, duration_minutes, started_at').gte('started_at', since),
    sb.from('tasks').select('id, assigned_to, status, created_at').gte('created_at', since),
  ]);

  const occ = (occRaw ?? []) as unknown as DashboardOcc[];
  const roster = (profilesRaw ?? []) as unknown as ProfileLite[];
  const siteName = new Map<string, string>(((sites ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));
  const acks = (acksRaw ?? []) as unknown as AckLiteRow[];

  // ----------------------------- alerts strip --------------------------------

  // "Open" = every non-terminal occurrence (open/acknowledged/in_progress/on_patrol),
  // matching the dashboard so open + resolved = total.
  const isTerminal = (s: string) => (TERMINAL_STATUSES as readonly string[]).includes(s);
  const openCount = occ.filter((o) => !isTerminal(o.status)).length;
  // isSlaBreached / isSlaUpdateDue expect the strict OccurrenceStatus enum
  // type from shared; runtime values are equivalent so cast through unknown.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const breached = occ.filter((o) => isSlaBreached(o as any, now)).length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateDue = occ.filter((o) => isSlaUpdateDue(o as any, now) && !isSlaBreached(o as any, now)).length;

  // ----------------------------- hero KPIs -----------------------------------

  const totalInPeriod = occ.length;
  const resolved = occ.filter((o) => isTerminal(o.status)).length;
  const closedWithTime = occ.filter((o) => o.closed_at);
  const avgResHrs = closedWithTime.length
    ? Math.round(
        (closedWithTime.reduce((s, o) =>
          s + (new Date(o.closed_at as string).getTime() - new Date(o.incident_at).getTime()), 0)
          / closedWithTime.length) / 36e5,
      )
    : 0;

  // Highest-risk category — the type with the most incidents
  const typeMap = new Map<string, number>();
  occ.forEach((o) => typeMap.set(o.occurrence_type, (typeMap.get(o.occurrence_type) ?? 0) + 1));
  const typeBreakdown = [...typeMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const highestRisk = typeBreakdown[0] ?? { name: '—', count: 0 };

  // ----------------------------- severity ------------------------------------

  const severityCounts = SEVERITIES.reduce((acc, key) => {
    acc[key] = occ.filter((o) => o.severity === key).length;
    return acc;
  }, {} as Record<SeverityLevel, number>);

  // ----------------------------- top sites -----------------------------------

  const siteMap = new Map<string, number>();
  occ.forEach((o) => {
    const s = o.site_name ?? 'Unassigned';
    siteMap.set(s, (siteMap.get(s) ?? 0) + 1);
  });
  const topSites = [...siteMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // ----------------------------- monthly trend (6 months) --------------------

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  let trendQ = supabase
    .from('occurrences')
    .select('id, incident_at, status, sla_due_at, site_id')
    .gte('incident_at', sixMonthsAgo.toISOString());
  if (scopeSites) trendQ = trendQ.in('site_id', scopeSites);
  const { data: trendRaw } = await trendQ;
  const monthly = (() => {
    const map = new Map<string, { count: number; breached: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      map.set(`${d.getFullYear()}-${d.getMonth()}`, { count: 0, breached: 0 });
    }
    (trendRaw ?? []).forEach((o) => {
      const d = new Date(o.incident_at as string);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const slot = map.get(key);
      if (slot) {
        slot.count++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (isSlaBreached(o as any, now)) slot.breached++;
      }
    });
    return [...map.entries()].map(([k, v]) => {
      const m = Number(k.split('-')[1]);
      return { month: MONTHS[m], count: v.count, breached: v.breached };
    });
  })();

  // ----------------------------- SLA breach analysis -------------------------

  const slaEnd = (o: DashboardOcc) =>
    (o.status === 'resolved' || o.status === 'closed') && o.closed_at
      ? new Date(o.closed_at).getTime()
      : now.getTime();
  const breachedEver = (o: DashboardOcc) =>
    !!o.sla_due_at && slaEnd(o) > new Date(o.sla_due_at).getTime();
  const slaScoped = occ.filter((o) => o.sla_due_at);
  const slaTotal = slaScoped.length;
  const slaBreaches = slaScoped.filter(breachedEver);
  const slaWithin = slaTotal - slaBreaches.length;
  // Precise floats — the SlaComplianceReport formats them to 2 dp at display.
  const complianceRate = slaTotal ? (slaWithin / slaTotal) * 100 : 100;
  const avgOverageHrs = slaBreaches.length
    ? (slaBreaches.reduce((s, o) => s + (slaEnd(o) - new Date(o.sla_due_at as string).getTime()), 0)
        / slaBreaches.length) / 36e5
    : 0;
  const slaBySeverity = SEVERITIES.map((sev) => {
    const rows = slaScoped.filter((o) => o.severity === sev);
    const br = rows.filter(breachedEver).length;
    return {
      key: sev, label: SEVERITY_LABELS[sev],
      total: rows.length, breached: br,
      compliance: rows.length ? ((rows.length - br) / rows.length) * 100 : 100,
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
      compliance: v.total ? ((v.total - v.breached) / v.total) * 100 : 100,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  // ----------------------------- per-role rankings ---------------------------

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - 7);

  const occByLogger = new Map<string, DashboardOcc[]>();
  occ.forEach((o) => {
    if (!o.logged_by) return;
    const list = occByLogger.get(o.logged_by) ?? [];
    list.push(o);
    occByLogger.set(o.logged_by, list);
  });

  const occByAssignee = new Map<string, DashboardOcc[]>();
  occ.forEach((o) => {
    if (!o.assigned_to) return;
    const list = occByAssignee.get(o.assigned_to) ?? [];
    list.push(o);
    occByAssignee.set(o.assigned_to, list);
  });

  function buildLoggerRow(p: ProfileLite): RolePerfRow {
    const list = occByLogger.get(p.id) ?? [];
    const breachedCount = list.filter(breachedEver).length;
    return {
      user_id: p.id,
      full_name: p.full_name,
      email: p.email,
      site_name: p.site_id ? siteName.get(p.site_id) ?? null : null,
      total: list.length,
      today: list.filter((o) => new Date(o.incident_at) >= startOfToday).length,
      week: list.filter((o) => new Date(o.incident_at) >= startOfWeek).length,
      sla_breach_pct: list.length ? Math.round((breachedCount / list.length) * 100) : 0,
    };
  }

  const guards = roster.filter((p) => p.role === 'guard' || (p.roles ?? []).includes('guard'));
  const guardRows = guards
    .map(buildLoggerRow)
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const controlRoom = roster.filter((p) => p.role === 'control_room' || (p.roles ?? []).includes('control_room'));
  const controlRoomRows = controlRoom
    .map(buildLoggerRow)
    .sort((a, b) => b.total - a.total);

  // Manager rows — different metrics: acknowledgements + assigned/closed
  const acksByMgr = new Map<string, number>();
  acks.forEach((a) => {
    if (!a.reviewed_by) return;
    acksByMgr.set(a.reviewed_by, (acksByMgr.get(a.reviewed_by) ?? 0) + 1);
  });
  const managers = roster.filter((p) => p.role === 'manager' || (p.roles ?? []).includes('manager'));
  const managerRows: RolePerfRow[] = managers
    .map((p) => {
      const assigned = occByAssignee.get(p.id) ?? [];
      const closed = assigned.filter((o) => o.status === 'resolved' || o.status === 'closed');
      const breachedCount = assigned.filter(breachedEver).length;
      return {
        user_id: p.id,
        full_name: p.full_name,
        email: p.email,
        site_name: p.site_id ? siteName.get(p.site_id) ?? null : null,
        total: assigned.length,
        today: 0,
        week: 0,
        sla_breach_pct: assigned.length ? Math.round((breachedCount / assigned.length) * 100) : 0,
        assigned: assigned.length,
        closed: closed.length,
        response_rate: assigned.length ? Math.round((closed.length / assigned.length) * 100) : 0,
        acks: acksByMgr.get(p.id) ?? 0,
      };
    })
    .sort((a, b) => (b.acks ?? 0) - (a.acks ?? 0) || (b.assigned ?? 0) - (a.assigned ?? 0));

  // ----------------------------- per-user stats (existing table) -------------

  let userIds = roster.map((p) => p.id);
  let rosterFiltered = roster;
  if (roleFilter !== 'all') {
    rosterFiltered = roster.filter((p) => p.role === roleFilter || (p.roles ?? []).includes(roleFilter));
    userIds = rosterFiltered.map((p) => p.id);
  }
  const inSet = new Set(userIds);
  function tally<T extends { [k: string]: unknown }>(rows: T[] | null | undefined, key: keyof T) {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const k = String(r[key] ?? '');
      if (!inSet.has(k)) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }
  const byOcc = tally(occ, 'logged_by');
  const byPatrol = tally(patrolsRaw ?? [], 'guard_id');
  const byScan = tally(scansRaw ?? [], 'guard_id');
  const byShift = tally(shiftsRaw ?? [], 'user_id');
  const byAck = tally(acks, 'reviewed_by');
  const byTask = tally(tasksRaw ?? [], 'assigned_to');

  const userStats: UserStats[] = rosterFiltered.map((p) => {
    const occList = (byOcc.get(p.id) ?? []) as Array<{ status: string }>;
    const patList = (byPatrol.get(p.id) ?? []) as Array<{ duration_minutes: number | null }>;
    const scanList = byScan.get(p.id) ?? [];
    const shiftList = (byShift.get(p.id) ?? []) as Array<{ duration_minutes: number | null }>;
    const ackList = byAck.get(p.id) ?? [];
    const taskList = (byTask.get(p.id) ?? []) as Array<{ status: string }>;
    const occClosed = occList.filter((o) => o.status === 'resolved' || o.status === 'closed').length;
    return {
      user_id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
      roles: Array.isArray(p.roles) && p.roles.length > 0 ? p.roles : [p.role],
      site_name: p.site_id ? siteName.get(p.site_id) ?? null : null,
      occurrences: occList.length,
      occurrences_open: occList.length - occClosed,
      occurrences_closed: occClosed,
      patrols: patList.length,
      patrol_minutes: patList.reduce((s, x) => s + (x.duration_minutes ?? 0), 0),
      scans: scanList.length,
      shifts: shiftList.length,
      shift_minutes: shiftList.reduce((s, x) => s + (x.duration_minutes ?? 0), 0),
      acknowledgements: ackList.length,
      tasks_open: taskList.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length,
      tasks_done: taskList.filter((t) => t.status === 'done').length,
    };
  });

  // -------------------------------- render -----------------------------------
  return (
    <>
      <PageHeader
        title="Manager Performance Dashboard"
        description={`Real-time analytics & key performance indicators — last ${days} days.`}
      />

      {/* Alerts banner */}
      {(breached > 0 || updateDue > 0 || openCount > 50) && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-4 py-3 text-sm shadow-sm dark:border-amber-900 dark:from-amber-950/40 dark:to-yellow-950/40">
          <p className="mb-1 font-semibold text-amber-800 dark:text-amber-300">
            <span aria-hidden>⚠ </span>Active System Alerts
          </p>
          <ul className="space-y-0.5 text-amber-700 dark:text-amber-200">
            {openCount > 50 && <li>Too many open incidents ({openCount}) requiring attention.</li>}
            {breached > 0 && <li>{breached} incident(s) have breached their SLA.</li>}
            {updateDue > 0 && <li>{updateDue} incident(s) require SLA updates.</li>}
          </ul>
        </div>
      )}

      {/* Hero KPIs */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <HeroKpi
          tone="red"
          icon="TriangleAlert"
          label="Total Incidents"
          sublabel={`Last ${days} days`}
          value={totalInPeriod}
          footer={<span>{resolved} resolved · {openCount} open</span>}
        />
        <HeroKpi
          tone="blue"
          icon="ShieldAlert"
          label="Most Common Occurrence"
          sublabel="Occurrence Type"
          value={highestRisk.name}
          footer={`${highestRisk.count} incidents logged`}
        />
        <HeroKpi
          tone={avgResHrs <= 4 ? 'green' : 'red'}
          icon="Clock"
          label="Avg Resolution"
          sublabel="Time to close"
          value={`${avgResHrs} Hrs`}
          footer={avgResHrs <= 4 ? '✓ Within 4h target' : '⚠ Over 4h target'}
        />
      </div>

      {/* Period switcher */}
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[hsl(var(--muted))]">Period:</span>
        {[7, 30, 60, 90, 180, 365].map((d) => (
          <a
            key={d}
            href={`?days=${d}${roleFilter !== 'all' ? `&role=${roleFilter}` : ''}`}
            className={`rounded-full px-3 py-1 ${days === d ? 'bg-brand text-white' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
          >
            {d === 7 ? '7d' : d === 365 ? '1y' : `${d}d`}
          </a>
        ))}
      </div>

      {/* Category breakdown + high-frequency incidents */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <GradientSection title="Occurrence Breakdown by Type" icon="PieChart" tone="brand">
          <CategoryDonut data={typeBreakdown.slice(0, 7)} />
        </GradientSection>
        <GradientSection title="High-Frequency Incidents" icon="Flame" tone="red">
          <div className="space-y-3.5">
            {typeBreakdown.length === 0 && <p className="text-sm text-[hsl(var(--muted))]">No data yet.</p>}
            {(() => {
              // Scale bars relative to the top type so they fill visibly.
              const top = typeBreakdown.slice(0, 7);
              const maxCount = top[0]?.count || 1;
              return top.map((t, i) => {
                const pct = totalInPeriod ? Math.round((t.count / totalInPeriod) * 100) : 0;
                const barWidth = Math.max(Math.round((t.count / maxCount) * 100), 8);
                const color = BAR_PALETTE[i % BAR_PALETTE.length];
                return (
                  <div key={t.name} className="flex items-center gap-3">
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
                      <div className="h-4 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className="flex h-full items-center justify-end rounded-full pr-2 text-[10px] font-bold text-white"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: color,
                          }}
                        >
                          {barWidth >= 22 ? `${pct}%` : ''}
                        </div>
                      </div>
                      <div className="mt-1 text-right text-[10px] font-medium text-[hsl(var(--muted))]">
                        {pct}% of total incidents
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </GradientSection>
      </div>

      {/* Volume by site + monthly trend */}
      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <GradientSection title="Occurrence Volume by Site" icon="MapPin" tone="sky">
          <div className="space-y-3">
            {topSites.length === 0 && <p className="text-sm text-[hsl(var(--muted))]">No data yet.</p>}
            {topSites.slice(0, 8).map((s) => {
              const pct = totalInPeriod ? Math.round((s.count / totalInPeriod) * 100) : 0;
              return (
                <div key={s.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-[hsl(var(--muted))]">{s.count} ({pct}%)</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </GradientSection>
        <GradientSection title="Monthly Incident Trend" icon="TrendingUp" tone="violet">
          <div className="h-72">
            <MonthlyTrendChart data={monthly} />
          </div>
        </GradientSection>
      </div>

      {/* Guard performance */}
      <div className="mb-5">
        <GradientSection title="Guard Performance Ranking" subtitle="Top loggers by activity in the selected period" icon="ShieldCheck" tone="green">
          <RolePerformanceTable rows={guardRows.slice(0, 10)} variant="guard" />
        </GradientSection>
      </div>

      {/* Severity */}
      <div className="mb-5">
        <GradientSection title="Severity Distribution" icon="Layers" tone="amber">
          <SeverityCards counts={severityCounts} />
        </GradientSection>
      </div>

      {/* Advanced reports banner */}
      <div className="mb-5 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3 text-sm shadow-sm dark:border-violet-900 dark:from-violet-950/40 dark:to-fuchsia-950/40">
        <p className="font-semibold text-violet-800 dark:text-violet-200">
          <span aria-hidden>📊 </span>Advanced Performance Reports
        </p>
        <p className="text-violet-700 dark:text-violet-300">
          Exclusive access to Control Room &amp; Manager performance rankings and detailed SLA Breach Analysis.
        </p>
      </div>

      {/* Control Room */}
      <div className="mb-5">
        <GradientSection title="Control Room Performance Ranking" icon="Radio" tone="sky">
          <RolePerformanceTable rows={controlRoomRows.slice(0, 10)} variant="control_room" />
        </GradientSection>
      </div>

      {/* Manager */}
      <div className="mb-5">
        <GradientSection title="Manager Performance Ranking" icon="Crown" tone="violet">
          <RolePerformanceTable rows={managerRows.slice(0, 10)} variant="manager" />
        </GradientSection>
      </div>

      {/* SLA Compliance */}
      <div className="mb-5">
        <GradientSection title="SLA Breach Analysis & Compliance Tracking" icon="Gauge" tone="red">
          <SlaComplianceReport
            complianceRate={complianceRate}
            within={slaWithin}
            breached={slaBreaches.length}
            total={slaTotal}
            avgOverageHrs={avgOverageHrs}
            bySeverity={slaBySeverity}
            bySite={slaBySite}
          />
        </GradientSection>
      </div>

      {/* Detailed per-user table (existing) */}
      <div className="mb-5">
        <GradientSection title="Per-User Activity (filterable)" subtitle="Drill into individual contributions" icon="Users" tone="slate">
          <StaffReports
            rows={userStats}
            roleFilter={roleFilter}
            days={days}
            roles={APP_ROLES}
          />
        </GradientSection>
      </div>
    </>
  );
}
