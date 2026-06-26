import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { ReportsClient } from '@/components/reports/reports-client';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  // Only the (fast, cached) profile is fetched server-side. The heavy report
  // list is fetched + cached in the browser by ReportsClient, so revisiting
  // this page renders instantly instead of waiting on a US round-trip.
  const profile = await requireProfile();

  const profSiteIds = (profile as unknown as { site_ids?: string[] | null }).site_ids ?? [];
  const ownSites = Array.from(new Set([
    ...(Array.isArray(profSiteIds) ? profSiteIds : []),
    ...(profile.site_id ? [profile.site_id] : []),
  ]));
  const isUnscoped = profile.role === 'admin' || profile.role === 'super_user';

  return (
    <>
      <PageHeader title="Occurrence Reports" description="Detailed incident reports — view, filter or export to PDF." />
      <ReportsClient ownSites={ownSites} isUnscoped={isUnscoped} />
    </>
  );
}
