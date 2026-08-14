import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { AssistantChat } from '@/components/ai/assistant-chat';

export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  await requireProfile();

  return (
    <>
      <PageHeader
        title="Operations Assistant"
        description="Ask questions about your occurrences, sites, SLAs and workload. The assistant reads your live data rather than answering from general knowledge."
      />
      <AssistantChat />
    </>
  );
}
