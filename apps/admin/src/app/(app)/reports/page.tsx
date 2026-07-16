import { requireProfile } from '@/lib/auth';
import { siteScope } from '@/lib/site-scope';
import { PageHeader } from '@/components/page-header';
import { ReportsClient } from '@/components/reports/reports-client';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  // Only the (fast, cached) profile is fetched server-side. The heavy report
  // list is fetched + cached in the browser by ReportsClient, so revisiting
  // this page renders instantly instead of waiting on a US round-trip.
  const profile = await requireProfile();

  const { ownSites, isUnscoped } = siteScope(profile);

  return (
    <>
      <PageHeader title="Occurrence Reports" description="Detailed incident reports — view, filter or export to PDF." />
      <ReportsClient ownSites={ownSites} isUnscoped={isUnscoped} userId={profile.id} />
    </>
  );
}
