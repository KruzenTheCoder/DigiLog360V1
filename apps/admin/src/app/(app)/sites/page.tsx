import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isAdmin, isSuperUser as checkIsSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { SitesManager } from '@/components/sites/sites-manager';
import type { Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
  const profile = await requireProfile();
  if (!isAdmin(profile)) redirect('/dashboard');

  const isSuperUser = checkIsSuperUser(profile);

  const supabase = await createClient();
  // Super-user sees every site across tenants and needs the org list to assign
  // sites to organisations; org admins only ever see their own org's sites.
  const [{ data }, orgsRes] = await Promise.all([
    supabase.from('sites').select('*').order('name'),
    isSuperUser
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any).from('organizations').select('id, name').order('name')
      : Promise.resolve({ data: [] }),
  ]);
  const orgs = (orgsRes.data ?? []) as { id: string; name: string }[];
  return (
    <>
      <PageHeader title="Sites" description="Manage operational sites within your organisation." />
      <SitesManager sites={(data ?? []) as Site[]} isSuperUser={isSuperUser} orgs={orgs} />
    </>
  );
}
