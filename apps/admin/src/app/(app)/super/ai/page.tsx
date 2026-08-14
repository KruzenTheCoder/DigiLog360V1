import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { AiSettingsManager } from '@/components/super/ai-settings-manager';

export const dynamic = 'force-dynamic';

export default async function SuperAiPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;
  const { data: orgs } = await sb
    .from('organizations')
    .select('id, name, ai_insights_enabled')
    .order('name');

  return (
    <>
      <PageHeader
        title="AI Assistant"
        description="Switch the AI briefing and assistant on or off per organisation. When it is off, no occurrence data is sent to the model for that organisation at all."
      />
      <AiSettingsManager orgs={orgs ?? []} />
    </>
  );
}
