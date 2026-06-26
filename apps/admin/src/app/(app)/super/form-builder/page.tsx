import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { FormBuilderToggles } from '@/components/super/form-builder-toggles';
import type { LogFormConfig } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function FormBuilderPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;
  const { data: orgs } = await sb
    .from('organizations')
    .select('id, name, slug, log_form_config, is_active')
    .order('name', { ascending: true });

  return (
    <>
      <PageHeader
        title="Form Builder — Log Occurrence"
        description="Pick which sections show up on the Log New Occurrence page. Hidden sections are also exempt from validation, so the form still submits cleanly."
      />
      <FormBuilderToggles
        orgs={((orgs ?? []) as Array<{
          id: string;
          name: string;
          slug: string;
          log_form_config: LogFormConfig | null;
          is_active: boolean;
        }>)}
      />
    </>
  );
}
