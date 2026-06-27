import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { MobileLayoutControls } from '@/components/super/mobile-layout-controls';
import type { AppRole } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface OrgRow { id: string; name: string; slug: string }
interface GrantRow { role: AppRole; capability_key: string }

export default async function MobileLayoutPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const params = await searchParams;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  const { data: orgs } = await sb.from('organizations').select('id, name, slug').order('name');
  const orgList = (orgs ?? []) as OrgRow[];
  const selectedOrgId = (typeof params.org === 'string' && params.org) || orgList[0]?.id;

  if (!selectedOrgId) {
    return <PageHeader title="Mobile Layout" description="No organisations yet." />;
  }

  // Only need the mobile.* grants for this org.
  const { data: grants } = await sb
    .from('role_capabilities')
    .select('role, capability_key')
    .eq('org_id', selectedOrgId)
    .like('capability_key', 'mobile.%');

  return (
    <>
      <PageHeader
        title="Mobile Layout"
        description="Control the mobile bottom bar and home cards per role — without touching the full permissions matrix."
      />
      <MobileLayoutControls
        orgs={orgList}
        grants={(grants ?? []) as GrantRow[]}
        selectedOrgId={selectedOrgId}
      />
    </>
  );
}
