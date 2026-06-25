import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { BrandingToggleForm } from '@/components/super/branding-toggle-form';

export const dynamic = 'force-dynamic';

export default async function BrandingPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;
  const { data: orgs } = await sb
    .from('organizations')
    .select('id, name, slug, show_netstream_logo, is_active')
    .order('name', { ascending: true });

  return (
    <>
      <PageHeader
        title="Branding"
        description="Per-organisation branding overrides. Toggle the parent-company logo for white-label deployments."
      />
      <BrandingToggleForm orgs={(orgs ?? []) as Org[]} />
    </>
  );
}

interface Org {
  id: string;
  name: string;
  slug: string;
  show_netstream_logo: boolean;
  is_active: boolean;
}
