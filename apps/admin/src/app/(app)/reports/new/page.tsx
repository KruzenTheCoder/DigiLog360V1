import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { ReportForm } from '@/components/reports/report-form';
import type { Occurrence, OccurrenceReport } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function NewReportPage({
  searchParams,
}: { searchParams: Promise<{ occurrence?: string }> }) {
  const profile = await requireProfile();
  const { occurrence: occId } = await searchParams;
  if (!occId) redirect('/reports');

  const supabase = await createClient();
  // Both reads key off the same occurrence id and don't depend on each other —
  // fetch them together. (Worst case we fetch a report for a missing occurrence,
  // which is harmless; we guard on `occ` immediately after.)
  const [{ data: occ }, { data: report }] = await Promise.all([
    supabase.from('occurrences').select('*').eq('id', Number(occId)).single(),
    supabase.from('occurrence_reports').select('*').eq('occurrence_id', Number(occId)).maybeSingle(),
  ]);
  if (!occ) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Occurrence Report" description={`Detailed report for ${occ.ob_number}`} />
      <ReportForm occurrence={occ as Occurrence} profile={profile} existingReport={report as OccurrenceReport | null} />
    </div>
  );
}
