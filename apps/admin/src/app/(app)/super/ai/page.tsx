import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { AiSettingsManager, type FeatureRow } from '@/components/super/ai-settings-manager';

export const dynamic = 'force-dynamic';

export default async function SuperAiPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  const [{ data: orgs }, { data: features }] = await Promise.all([
    sb.from('organizations')
      .select('id, name, ai_insights_enabled, ai_chat_enabled, ai_weekly_digest_enabled, ai_digest_roles')
      .order('name'),
    sb.from('org_feature_roles').select('org_id, feature_key, roles'),
  ]);

  return (
    <>
      <PageHeader
        title="AI & Features"
        description="Per-tenant control of the AI briefing, the chat assistant and the weekly email — and which roles can see the newer surfaces. Switched off, nothing is sent to the model for that organisation."
      />
      <AiSettingsManager
        orgs={orgs ?? []}
        features={(features ?? []) as FeatureRow[]}
      />
    </>
  );
}
