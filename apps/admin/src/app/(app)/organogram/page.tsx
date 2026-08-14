import { createClient } from '@/lib/supabase/server';
import { requireProfile, isManager } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Organogram } from '@/components/org/organogram';

export const dynamic = 'force-dynamic';

export default async function OrganogramPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  const [{ data: people }, { data: positions }] = await Promise.all([
    sb.from('profiles')
      .select('id, full_name, email, role, reports_to, is_active, org_id')
      .order('full_name'),
    sb.from('org_chart_positions').select('profile_id, x, y'),
  ]);

  return (
    <>
      <PageHeader
        title="Organogram"
        description="Who reports to whom. This is what decides where an escalated occurrence goes — the person above the raiser gets the task and the email."
      />
      <Organogram
        people={(people ?? []).filter((p: { is_active?: boolean }) => p.is_active !== false)}
        positions={positions ?? []}
        canEdit={isManager(profile)}
      />
    </>
  );
}
