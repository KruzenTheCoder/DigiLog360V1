import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { OrgSettingsForm } from '@/components/settings/org-settings-form';
import type { Organization } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function OrgSettingsPage() {
  const profile = await requireProfile();
  if (!isAdmin(profile)) redirect('/dashboard');
  if (!profile.org_id) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('organizations').select('*').eq('id', profile.org_id).single();
  if (!data) redirect('/dashboard');

  return (
    <>
      <PageHeader
        title="Organisation"
        description="Your organisation's branding, contact details and plan."
      />
      <OrgSettingsForm org={data as unknown as Organization} canEdit isSuperUser={profile.role === 'super_user'} />
    </>
  );
}
