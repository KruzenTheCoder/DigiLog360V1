import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { LiveBoard } from '@/components/occurrences/live-board';
import type { LiveOccurrence } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function LiveOccurrencesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from('occurrences_live')
    .select('*')
    .order('incident_at', { ascending: false });

  return (
    <>
      <PageHeader title="Live Occurrences" description="Open incidents with real-time SLA tracking." />
      <LiveBoard initial={(data ?? []) as LiveOccurrence[]} profile={profile} />
    </>
  );
}
