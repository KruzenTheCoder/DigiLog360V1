import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { ReportsTable } from '@/components/reports/reports-table';
import type { OccurrenceReport } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Same site-scope rule as the rest of the report-shaped pages.
  const profSiteIds = (profile as unknown as { site_ids?: string[] | null }).site_ids ?? [];
  const ownSites = Array.from(new Set([
    ...(Array.isArray(profSiteIds) ? profSiteIds : []),
    ...(profile.site_id ? [profile.site_id] : []),
  ]));
  const isUnscopedRole = profile.role === 'admin' || profile.role === 'super_user';

  // Filter reports by joining through occurrences.site_id — `occurrence_reports`
  // itself doesn't carry site_id. We grab the occurrence rows for the user's
  // site scope first, then pull reports for those occurrences.
  let allowedIds: number[] | null = null;
  if (!isUnscopedRole && ownSites.length > 0) {
    const { data: occs } = await supabase
      .from('occurrences')
      .select('id')
      .in('site_id', ownSites);
    allowedIds = (occs ?? []).map((o) => o.id);
  }

  let q = supabase
    .from('occurrence_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (allowedIds !== null) {
    // Avoid an empty .in() (PostgREST returns no rows but emits a warning).
    q = allowedIds.length > 0 ? q.in('occurrence_id', allowedIds) : q.eq('occurrence_id', -1);
  }

  const { data } = await q;
  const reports = (data ?? []) as OccurrenceReport[];

  return (
    <>
      <PageHeader title="Occurrence Reports" description="Detailed incident reports — view, filter or export to PDF." />
      <ReportsTable reports={reports} />
    </>
  );
}
