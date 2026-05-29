import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { OccurrencesTable } from '@/components/occurrences/occurrences-table';
import type { Occurrence } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function AllOccurrencesPage() {
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from('occurrences')
    .select('*')
    .order('incident_at', { ascending: false })
    .limit(1000);

  return (
    <>
      <PageHeader title="All Occurrences" description="Complete occurrence book — live and closed." />
      <OccurrencesTable rows={(data ?? []) as Occurrence[]} />
    </>
  );
}
