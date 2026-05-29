import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { ReportForm } from '@/components/reports/report-form';
import type { Occurrence } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function NewReportPage({
  searchParams,
}: { searchParams: Promise<{ occurrence?: string }> }) {
  const profile = await requireProfile();
  const { occurrence: occId } = await searchParams;
  if (!occId) redirect('/reports');

  const supabase = await createClient();
  const { data: occ } = await supabase.from('occurrences').select('*').eq('id', Number(occId)).single();
  if (!occ) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Occurrence Report" description={`Detailed report for ${occ.ob_number}`} />
      <ReportForm occurrence={occ as Occurrence} profile={profile} />
    </div>
  );
}
