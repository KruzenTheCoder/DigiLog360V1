import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { GuardMap } from '@/components/guards/guard-map';

export const dynamic = 'force-dynamic';

interface Position {
  guard_id: string; guard_name: string | null;
  site_id: string | null; latitude: number; longitude: number;
  accuracy_m: number | null; recorded_at: string; on_patrol: boolean;
}

export default async function GuardsMapPage() {
  await requireProfile();
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('guard_positions_latest').select('*');
  const positions = (data ?? []) as Position[];

  return (
    <>
      <PageHeader
        title="Guard Map"
        description="Live positions of guards reporting from the mobile app. Updated every 30 seconds while on patrol."
      />
      <GuardMap initial={positions} />
    </>
  );
}
