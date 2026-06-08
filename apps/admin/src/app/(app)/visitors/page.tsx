import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { VisitorsBoard } from '@/components/visitors/visitors-board';
import type { Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface VisitorRow {
  id: string; full_name: string; id_number: string | null; company: string | null;
  vehicle_reg: string | null; visiting: string | null; reason: string | null;
  site_id: string | null; site_name: string | null;
  signed_in_at: string; signed_in_by_name: string | null;
  signed_out_at: string | null;
}

export default async function VisitorsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [sitesRes, currentRes] = await Promise.all([
    supabase.from('sites').select('*').order('name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('visitors').select('*')
      .order('signed_in_at', { ascending: false }).limit(200),
  ]);

  return (
    <>
      <PageHeader title="Visitor Log" description="Sign visitors in and out of every site." />
      <VisitorsBoard
        initial={(currentRes.data ?? []) as VisitorRow[]}
        sites={(sitesRes.data ?? []) as Site[]}
        currentUserId={profile.id}
        currentUserName={profile.full_name ?? profile.email ?? 'Gate Guard'}
      />
    </>
  );
}
