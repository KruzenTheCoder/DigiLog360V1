import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isManager } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { StaffReports } from '@/components/manager/staff-reports';
import { APP_ROLES, type AppRole } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  roles: AppRole[] | null;
  site_id: string | null;
}

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
  // Mirror the component-side index signature so the StaffReports prop
  // accepts these rows.
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

  // ---------- Roster (filtered by role if asked) ----------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).from('profiles').select('id, full_name, email, role, roles, site_id');
  if (roleFilter !== 'all') {
    // Match either primary role OR roles[] contains it
    q = q.or(`role.eq.${roleFilter},roles.cs.{${roleFilter}}`);
  }
  q = q.order('full_name', { ascending: true, nullsFirst: false });
  const { data: profiles } = await q;
  const roster: ProfileLite[] = (profiles ?? []) as ProfileLite[];
  const userIds = roster.map((p) => p.id);

  // ---------- Sites lookup ----------
  const { data: sites } = await supabase.from('sites').select('id, name');
  const siteName = new Map<string, string>((sites ?? []).map((s) => [s.id, s.name]));

  // ---------- Per-user roll-up via small parallel queries ----------
  // For each metric, we run one query and aggregate client-side. Postgres
  // group-by would be cleaner but we'd need an RPC; this stays portable.
  const [
    occRes,
    patrolRes,
    scanRes,
    shiftRes,
    ackRes,
    tasksRes,
  ] = await Promise.all([
    supabase.from('occurrences').select('id, logged_by, status, created_at')
      .gte('created_at', since).in('logged_by', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('patrols').select('id, guard_id, duration_minutes, started_at')
      .gte('started_at', since).in('guard_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('checkpoint_scans').select('id, guard_id, scanned_at')
      .gte('scanned_at', since).in('guard_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('shifts').select('id, user_id, duration_minutes, started_at')
      .gte('started_at', since).in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('manager_acknowledgements').select('id, reviewed_by, reviewed_at')
      .gte('reviewed_at', since).in('reviewed_by', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('tasks').select('id, assigned_to, status, created_at')
      .gte('created_at', since).in('assigned_to', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']),
  ]);

  function tally<T extends Record<string, unknown>>(
    rows: T[] | null | undefined,
    key: keyof T,
  ): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const k = String(r[key] ?? '');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }

  const byOcc = tally(occRes.data ?? [], 'logged_by');
  const byPatrol = tally(patrolRes.data ?? [], 'guard_id');
  const byScan = tally(scanRes.data ?? [], 'guard_id');
  const byShift = tally(shiftRes.data ?? [], 'user_id');
  const byAck = tally(ackRes.data ?? [], 'reviewed_by');
  const byTask = tally(tasksRes.data ?? [], 'assigned_to');

  const stats: UserStats[] = roster.map((p) => {
    const occ = (byOcc.get(p.id) ?? []) as Array<{ status: string }>;
    const patrols = (byPatrol.get(p.id) ?? []) as Array<{ duration_minutes: number | null }>;
    const scans = byScan.get(p.id) ?? [];
    const shifts = (byShift.get(p.id) ?? []) as Array<{ duration_minutes: number | null }>;
    const acks = byAck.get(p.id) ?? [];
    const tasks = (byTask.get(p.id) ?? []) as Array<{ status: string }>;

    const occClosed = occ.filter((o) => o.status === 'resolved' || o.status === 'closed').length;

    return {
      user_id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
      roles: Array.isArray(p.roles) && p.roles.length > 0 ? p.roles : [p.role],
      site_name: p.site_id ? siteName.get(p.site_id) ?? null : null,
      occurrences: occ.length,
      occurrences_open: occ.length - occClosed,
      occurrences_closed: occClosed,
      patrols: patrols.length,
      patrol_minutes: patrols.reduce((s, p) => s + (p.duration_minutes ?? 0), 0),
      scans: scans.length,
      shifts: shifts.length,
      shift_minutes: shifts.reduce((s, sh) => s + (sh.duration_minutes ?? 0), 0),
      acknowledgements: acks.length,
      tasks_open: tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length,
      tasks_done: tasks.filter((t) => t.status === 'done').length,
    };
  });

  return (
    <>
      <PageHeader
        title="Staff Reports"
        description={`Per-user activity in the last ${days} days, filterable by role.`}
      />
      <StaffReports
        rows={stats}
        roleFilter={roleFilter}
        days={days}
        roles={APP_ROLES}
      />
    </>
  );
}
