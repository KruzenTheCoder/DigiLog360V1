import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { activeOrgId } from '@/lib/active-org';
import { PageHeader } from '@/components/page-header';
import { AiSettingsManager, type FeatureRow } from '@/components/super/ai-settings-manager';
import { AiTypeMemory, type TypeMemoryRow } from '@/components/super/ai-type-memory';
import { AiUsagePanel, type UsageRow } from '@/components/super/ai-usage-panel';

export const dynamic = 'force-dynamic';

/** Mirrors AI_DAILY_TOKEN_CAP in the edge function. */
const DAILY_TOKEN_CAP = 92000;

export default async function SuperAiPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');
  const scopedOrg = await activeOrgId(profile);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ data: orgs }, { data: features }, { data: memory }, { data: usage }] = await Promise.all([
    sb.from('organizations')
      .select('id, name, ai_insights_enabled, ai_chat_enabled, ai_weekly_digest_enabled, ai_digest_roles')
      .order('name'),
    sb.from('org_feature_roles').select('org_id, feature_key, roles'),
    sb.from('ai_type_memory')
      .select('id, org_id, occurrence_type, kind, rationale, decided_by, confidence, locked')
      .order('occurrence_type'),
    sb.from('ai_usage').select('mode, source, total_tokens, ok').gte('created_at', since),
  ]);

  return (
    <>
      <PageHeader
        title="AI & Features"
        description="Per-tenant control of the AI briefing, the chat assistant and the weekly email — and which roles can see the newer surfaces. Switched off, nothing is sent to the model for that organisation."
      />
      <div className="space-y-6">
        <AiSettingsManager
          orgs={orgs ?? []}
          features={(features ?? []) as FeatureRow[]}
        />
        <AiUsagePanel rows={(usage ?? []) as UsageRow[]} cap={DAILY_TOKEN_CAP} />
        <AiTypeMemory
          rows={(memory ?? []) as TypeMemoryRow[]}
          orgs={(orgs ?? []) as { id: string; name: string }[]}
          activeOrgId={scopedOrg}
        />
      </div>
    </>
  );
}
