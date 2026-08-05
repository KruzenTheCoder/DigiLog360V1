import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { EmailAlertsManager } from '@/components/super/email-alerts-manager';
import type { OrgEmailSettingsRow } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function EmailAlertsPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;
  const [{ data: orgs }, { data: settings }] = await Promise.all([
    sb.from('organizations')
      .select('id, name, slug, is_active')
      .order('name', { ascending: true }),
    // Tolerate the table not existing yet (migration not applied) — the
    // manager simply starts from platform defaults.
    sb.from('org_email_settings').select('*').then(
      (r: { data: OrgEmailSettingsRow[] | null }) => r,
      () => ({ data: null }),
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Email Alerts"
        description="Configure the task email notifications sent through Resend — per organisation, per event. Customise subjects, intro copy, sender identity and branding, with a live preview of exactly what recipients receive."
      />
      <EmailAlertsManager
        orgs={((orgs ?? []) as Array<{ id: string; name: string; slug: string; is_active: boolean }>)}
        settings={((settings ?? []) as OrgEmailSettingsRow[])}
      />
    </>
  );
}
