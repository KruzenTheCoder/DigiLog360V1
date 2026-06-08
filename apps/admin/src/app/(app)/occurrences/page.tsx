import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { LiveBoard } from '@/components/occurrences/live-board';
import type { LiveOccurrence } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function LiveOccurrencesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  // Explicit columns — matches the live-board client refresh.
  // ~1/3 the payload of `select('*')` on this view.
  const { data } = await supabase
    .from('occurrences_live')
    .select('id, ob_number, occurrence_type, description, severity, status, site_name, logged_by_name, incident_at, is_sla_breached, is_sla_update_due, minutes_remaining, has_report')
    .order('incident_at', { ascending: false });

  return (
    <>
      <PageHeader title="Live Occurrences" description="Open incidents with real-time SLA tracking." />
      <LiveBoard initial={(data ?? []) as LiveOccurrence[]} profile={profile} />
    </>
  );
}
