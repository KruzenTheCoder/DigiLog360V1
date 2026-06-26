import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { MyQueueClient } from '@/components/occurrences/my-queue-client';

export const dynamic = 'force-dynamic';

export default async function MyQueuePage() {
  const profile = await requireProfile();
  return (
    <>
      <PageHeader
        title="Assigned to Me"
        description="Occurrences you currently own. Close or reassign once handled."
      />
      <MyQueueClient userId={profile.id} />
    </>
  );
}
