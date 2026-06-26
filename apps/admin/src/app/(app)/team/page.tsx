import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { TeamClient } from '@/components/team/team-client';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  await requireProfile();
  return (
    <>
      <PageHeader title="Team Status" description="Field staff availability and active patrols." />
      <TeamClient />
    </>
  );
}
