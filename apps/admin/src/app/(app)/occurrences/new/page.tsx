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

  // RLS only lets non-admins log occurrences for their own site, so only offer that.
  let sitesQuery = supabase.from('sites').select('*').eq('is_active', true).order('name');
  if (profile.role !== 'admin' && profile.site_id) sitesQuery = sitesQuery.eq('id', profile.site_id);
  const { data: sites } = await sitesQuery;

  // Same-site guards/supervisors who can be credited as the reporter.
  let reporters: { id: string; name: string }[] = [];
  if (profile.site_id || profile.role === 'admin') {
    let query = supabase.from('profiles').select('id, full_name, email').in('role', ['guard', 'supervisor']);
    if (profile.role !== 'admin' && profile.site_id) query = query.eq('site_id', profile.site_id);
    const { data } = await query;
    reporters = (data ?? []).map((r) => ({ id: r.id, name: r.full_name ?? r.email ?? 'Unknown' }));
  }

  // Assignable users — only fetched when the caller can actually assign.
  // We offer anyone who can act on an occurrence (guard, supervisor, control
  // room, manager, admin) within the same site/org.
  let assignees: { id: string; name: string; role: string; jobTitle: string | null }[] = [];
  if (can(caps, 'occurrences.assign')) {
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

    assignees = rows.map((r) => ({
      id: r.id,
      name: r.full_name ?? r.email ?? 'Unknown',
      role: r.role,
      jobTitle: r.job_title ?? null,
    }));
  }

  // Per-org form-builder config (which sections to show on this form).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orgRow } = await (supabase as any)
    .from('organizations').select('log_form_config').eq('id', profile.org_id).maybeSingle();
  const formConfig: LogFormConfig = (orgRow?.log_form_config ?? {}) as LogFormConfig;

  return (
    <>
      <PageHeader title="Log New Occurrence" description="Record an occurrence in the security book." />
      <LogIncidentForm
        profile={profile}
        sites={(sites ?? []) as Site[]}
        reporters={reporters}
        assignees={assignees}
        canAssign={can(caps, 'occurrences.assign')}
        canLogManagementReport={can(caps, 'occurrences.log_management_report')}
        formConfig={formConfig}
      />
    </>
  );
}
