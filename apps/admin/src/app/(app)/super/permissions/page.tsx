import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { PermissionsMatrix } from '@/components/super/permissions-matrix';
import type { AppRole } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface CapabilityRow { key: string; area: string; label: string; description: string | null; is_system: boolean }
interface GrantRow { org_id: string; role: AppRole; capability_key: string }
interface OrgRow { id: string; name: string; slug: string }

export default async function PermissionsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const params = await searchParams;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orgsRes, capsRes] = await Promise.all([
    (supabase as any).from('organizations').select('id, name, slug').order('name'),
    (supabase as any).from('capabilities').select('*').order('area').order('key'),
  ]);
  const orgs = (orgsRes.data ?? []) as OrgRow[];
  const caps = (capsRes.data ?? []) as CapabilityRow[];

  const selectedOrgId = (typeof params.org === 'string' && params.org) || orgs[0]?.id;
  if (!selectedOrgId) {
    return (
      <>
        <PageHeader title="Permissions" description="No organisations yet." />
      </>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: grants } = await (supabase as any)
    .from('role_capabilities')
    .select('org_id, role, capability_key')
    .eq('org_id', selectedOrgId);

  return (
    <>
      <PageHeader
        title="Permissions"
        description="Toggle which capabilities each role holds, per organisation. Super user always has everything."
      />
      <PermissionsMatrix
        orgs={orgs}
        capabilities={caps}
        grants={(grants ?? []) as GrantRow[]}
        selectedOrgId={selectedOrgId}
      />
    </>
  );
}
