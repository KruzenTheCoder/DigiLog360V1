import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isManager } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { AcknowledgementQueue } from '@/components/manager/acknowledgement-queue';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import type { Occurrence, ManagerAcknowledgement } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function AcknowledgementsPage() {
  const profile = await requireProfile();
  if (!isManager(profile)) redirect('/dashboard');

  const supabase = await createClient();

  // Show occurrences that don't yet have a manager acknowledgement.
  // The two reads are independent — run them in parallel rather than serially.
  const [{ data: occ }, { data: acks }] = await Promise.all([
    supabase
      .from('occurrences')
      .select('*')
      .order('incident_at', { ascending: false })
      .limit(200),
    // manager_acknowledgements is from a newer migration than database.types.ts
    // — cast until db:types regeneration.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('manager_acknowledgements')
      .select('occurrence_id'),
  ]);

  const ackedIds = new Set(((acks ?? []) as { occurrence_id: number }[]).map((a) => a.occurrence_id));
  const pending = ((occ ?? []) as Occurrence[]).filter((o) => !ackedIds.has(o.id));

  return (
    <>
      <RealtimeRefresh tables={['occurrences']} />
      <PageHeader
        title="Manager Acknowledgements"
        description="Review and sign off on logged incidents. Acknowledge, escalate or reject."
      />
      <AcknowledgementQueue
        items={pending}
        reviewerId={profile.id}
        reviewerName={profile.full_name ?? profile.email ?? 'Manager'}
        orgId={profile.org_id}
      />
    </>
  );
}
