import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { LogIncidentForm } from '@/components/occurrences/log-incident-form';
import type { Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function NewOccurrencePage() {
  const profile = await requireProfile();
  const supabase = await createClient();

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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Log New Incident" description="Record an occurrence in the security book." />
      <LogIncidentForm profile={profile} sites={(sites ?? []) as Site[]} reporters={reporters} />
    </div>
  );
}
