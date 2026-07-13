import { createClient } from '@/lib/supabase/server';
import { requireProfile, loadMyCapabilities, can } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { LogIncidentForm } from '@/components/occurrences/log-incident-form';
import type { LogFormConfig, Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function NewOccurrencePage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const caps = await loadMyCapabilities();

  // These four reads are independent of one another, so run them as one
  // parallel batch rather than a serial waterfall (this is a high-traffic
  // page — guards/control room log incidents constantly, and from SA→US every
  // serial round-trip is ~235 ms of dead time).

  // RLS only lets non-admins log occurrences for their own site, so only offer that.
  const sitesQuery = (async (): Promise<Site[]> => {
    let sq = supabase.from('sites').select('*').eq('is_active', true).order('name');
    if (profile.role !== 'admin' && profile.site_id) sq = sq.eq('id', profile.site_id);
    const { data } = await sq;
    return (data ?? []) as Site[];
  })();

  // Same-site guards/supervisors who can be credited as the reporter.
  const reportersQuery = (async (): Promise<{ id: string; name: string }[]> => {
    if (!(profile.site_id || profile.role === 'admin')) return [];
    let query = supabase.from('profiles').select('id, full_name, email').in('role', ['guard', 'supervisor']);
    if (profile.role !== 'admin' && profile.site_id) query = query.eq('site_id', profile.site_id);
    const { data } = await query;
    return (data ?? []).map((r) => ({ id: r.id, name: r.full_name ?? r.email ?? 'Unknown' }));
  })();

  // Assignable users — only fetched when the caller can actually assign.
  // We offer anyone who can act on an occurrence (guard, supervisor, control
  // room, manager, admin) within the same site/org.
  const assigneesQuery = (async (): Promise<{ id: string; name: string; role: string; jobTitle: string | null }[]> => {
    if (!can(caps, 'occurrences.assign')) return [];
    // The generated AppRoleEnum lags behind the live `app_role` enum, so we
    // route through `any` for this query only.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // The "assignee allow-list" — only profiles flagged is_assignable=true.
    // Super-user manages this list at /super/assignees. If no one is flagged
    // (fresh installs), fall back to every reviewer-eligible role so the
    // feature is fully opt-in and never returns an empty dropdown.
    const { data: flagged } = await sb
      .from('profiles')
      .select('id, full_name, email, role, job_title, site_id')
      .eq('is_active', true)
      .eq('is_assignable', true)
      .order('full_name', { ascending: true, nullsFirst: false });

    let rows = (flagged ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string; job_title: string | null; site_id: string | null }>;

    if (rows.length === 0) {
      // Fallback to the broad reviewer pool (matches previous behaviour).
      let q = sb
        .from('profiles')
        .select('id, full_name, email, role, job_title, site_id')
        .eq('is_active', true)
        .in('role', ['guard', 'supervisor', 'control_room', 'manager', 'admin']);
      if (profile.role !== 'admin' && profile.site_id) q = q.eq('site_id', profile.site_id);
      q = q.order('full_name', { ascending: true, nullsFirst: false });
      const { data } = await q;
      rows = (data ?? []) as typeof rows;
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.full_name ?? r.email ?? 'Unknown',
      role: r.role,
      jobTitle: r.job_title ?? null,
    }));
  })();

  // Per-org form-builder config (which sections to show on this form).
  const orgConfigQuery = (async (): Promise<LogFormConfig> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orgRow } = await (supabase as any)
      .from('organizations').select('log_form_config').eq('id', profile.org_id).maybeSingle();
    return (orgRow?.log_form_config ?? {}) as LogFormConfig;
  })();

  const [sites, reporters, assignees, formConfig] = await Promise.all([
    sitesQuery, reportersQuery, assigneesQuery, orgConfigQuery,
  ]);

  return (
    <>
      <PageHeader title="Log New Occurrence" description="Record an occurrence in the security book." />
      <LogIncidentForm
        profile={profile}
        sites={(sites ?? []) as Site[]}
        reporters={reporters}
        assignees={assignees}
        canAssign={can(caps, 'occurrences.assign')}
        // The "Management Reports" option is controlled solely by the per-user
        // flag managed at /super/management-reports — turning it off there
        // reliably hides the option (a role capability can't silently re-grant
        // it). Existing holders were seeded on by migration
        // 20260713000002 so nobody lost access on rollout.
        canLogManagementReport={profile.can_log_management_report === true}
        formConfig={formConfig}
      />
    </>
  );
}
