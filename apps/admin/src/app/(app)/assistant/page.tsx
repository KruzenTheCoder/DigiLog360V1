import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { activeOrgId } from '@/lib/active-org';
import { PageHeader } from '@/components/page-header';
import { AssistantChat } from '@/components/ai/assistant-chat';

export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  const profile = await requireProfile();
  const orgId = await activeOrgId(profile);

  // The assistant is per-tenant. A super user is a platform account, so the
  // tenant comes from the header picker; everyone else gets their own.
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from('organizations')
    .select('name, ai_chat_enabled')
    .eq('id', orgId)
    .maybeSingle();

  // Switched off means the page should not exist for that tenant, rather than
  // loading and then refusing every question.
  if (org && org.ai_chat_enabled === false) redirect('/dashboard');

  return (
    <>
      <PageHeader
        title="Operations Assistant"
        description={`Ask questions about occurrences, sites, SLAs and workload${org?.name ? ` at ${org.name}` : ''}. The assistant reads live data rather than answering from general knowledge.`}
      />
      <AssistantChat orgId={orgId ?? ''} />
    </>
  );
}
