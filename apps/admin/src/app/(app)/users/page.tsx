import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isAdmin } from '@/lib/auth';
import { activeOrgId } from '@/lib/active-org';
import { PageHeader } from '@/components/page-header';
import { UsersManager } from '@/components/users/users-manager';
import { profileRoles, type Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const profile = await requireProfile();
  // Scoped to the tenant the header selects. A super user's RLS spans every
  // organisation, so without this the page answers for the wrong one.
  const orgId = await activeOrgId(profile);
  if (!isAdmin(profile)) redirect('/dashboard');

  const supabase = await createClient();
  const [{ data: users }, { data: sites }] = await Promise.all([
    (supabase as any).from('profiles').select('*, sites(name)').eq('org_id', orgId).order('created_at', { ascending: false }),
    (supabase as any).from('sites').select('*').eq('org_id', orgId).order('name'),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage console and field accounts, roles, employee numbers and PINs."
      />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <UsersManager
        users={(users ?? []) as any}
        sites={(sites ?? []) as Site[]}
        callerRoles={profileRoles(profile)}
        callerOrgId={profile.org_id}
        callerId={profile.id}
      />
    </>
  );
}
