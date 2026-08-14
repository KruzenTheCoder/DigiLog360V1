import { createClient } from '@/lib/supabase/server';
import { requireProfile, isManager } from '@/lib/auth';
import { activeOrgId } from '@/lib/active-org';
import { PageHeader } from '@/components/page-header';
import { Organogram } from '@/components/org/organogram';

export const dynamic = 'force-dynamic';

export default async function OrganogramPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  // Scoped explicitly rather than left to RLS. A super user's policy spans
  // every tenant, so without this the chart would draw PMI and Netstream
  // people into one structure — two companies in one org chart.
  const orgId = await activeOrgId(profile);

  const [{ data: people }, { data: positions }, { data: org }] = await Promise.all([
    sb.from('profiles')
      .select('id, full_name, email, role, reports_to, is_active, org_id')
      .eq('org_id', orgId)
      .order('full_name'),
    sb.from('org_chart_positions').select('profile_id, x, y').eq('org_id', orgId),
    sb.from('organizations').select('name').eq('id', orgId).maybeSingle(),
  ]);

  const orgName = (org?.name as string | undefined) ?? null;

  return (
    <>
      <PageHeader
        title="Organogram"
        description={`Who reports to whom${orgName ? ` at ${orgName}` : ''}. This is what decides where an escalated occurrence goes — the person above the raiser gets the task and the email.`}
      />
      <Organogram
        people={(people ?? []).filter((p: { is_active?: boolean }) => p.is_active !== false)}
        positions={positions ?? []}
        canEdit={isManager(profile)}
        orgId={orgId ?? ''}
      />
    </>
  );
}
