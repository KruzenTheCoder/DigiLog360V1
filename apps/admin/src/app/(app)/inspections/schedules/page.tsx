import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isManager } from '@/lib/auth';
import { activeOrgId } from '@/lib/active-org';
import { PageHeader } from '@/components/page-header';
import { ScheduleManager } from '@/components/inspections/schedule-manager';

export const dynamic = 'force-dynamic';

export default async function InspectionSchedulesPage() {
  const profile = await requireProfile();
  if (!isManager(profile)) redirect('/inspections');
  const orgId = await activeOrgId(profile);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  const [schedRes, sitesRes, peopleRes] = await Promise.all([
    sb.from('inspection_schedules').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    sb.from('sites').select('id, name, latitude, longitude').eq('org_id', orgId).order('name'),
    sb.from('profiles').select('id, full_name, role').eq('org_id', orgId).order('full_name'),
  ]);

  return (
    <>
      <PageHeader
        title="Inspection Schedules"
        description="Recurring rules — who inspects which site, how often, and what they check. Visits are generated automatically from these and appear on the calendar."
      />
      <ScheduleManager
        initial={schedRes.data ?? []}
        sites={sitesRes.data ?? []}
        people={peopleRes.data ?? []}
      />
    </>
  );
}
