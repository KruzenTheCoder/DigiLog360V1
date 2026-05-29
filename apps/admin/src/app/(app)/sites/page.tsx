import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { SitesManager } from '@/components/sites/sites-manager';
import type { Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
  const profile = await requireProfile();
  if (profile.role !== 'admin') redirect('/dashboard');
  const supabase = await createClient();
  const { data } = await supabase.from('sites').select('*').order('name');
  return (
    <>
      <PageHeader title="Sites" description="Manage operational sites." />
      <SitesManager sites={(data ?? []) as Site[]} />
    </>
  );
}
