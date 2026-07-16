import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { siteScope } from '@/lib/site-scope';
import { PageHeader } from '@/components/page-header';
import { LiveBoard } from '@/components/occurrences/live-board';
import type { LiveOccurrence } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function LiveOccurrencesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Site scope — admin / super_user (any held role) see every site; everyone
  // else is restricted to the sites they're assigned to.
  const { ownSites, isUnscoped } = siteScope(profile);

  // Explicit columns — matches the live-board client refresh.
  // ~1/3 the payload of `select('*')` on this view.
  const fetchLive = async () => {
    const base = () => supabase
      .from('occurrences_live')
      .select('id, ob_number, occurrence_type, description, severity, status, site_name, site_id, logged_by_name, incident_at, sla_due_at, last_sla_update_at, sla_hours, update_interval_minutes, is_sla_breached, is_sla_update_due, minutes_remaining, has_report')
      .order('incident_at', { ascending: false });

    if (!isUnscoped) {
      if (ownSites.length === 0) {
        // Site-less scoped user — show only what they logged themselves.
        // (An unfiltered query would time out under RLS and render nothing.)
        const { data } = await base().eq('logged_by', profile.id);
        return data ?? [];
      }
      const results = await Promise.all(ownSites.map(sid => base().eq('site_id', sid)));
      const merged = results.flatMap(r => r.data ?? []);
      merged.sort((a, b) => new Date(b.incident_at).getTime() - new Date(a.incident_at).getTime());
      return merged;
    }

    const { data } = await base();
    return data ?? [];
  };

  const data = await fetchLive();

  return (
    <>
      <PageHeader title="Live Occurrences" description="Open incidents with real-time SLA tracking." />
      <LiveBoard initial={(data ?? []) as LiveOccurrence[]} profile={profile} />
    </>
  );
}
