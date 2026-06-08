import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isManager } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { SchedulesManager } from '@/components/patrols/schedules-manager';
import type { PatrolRoute, Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface ScheduleRow {
  id: string; route_id: string; site_id: string | null; name: string;
  interval_minutes: number; start_hour: number; end_hour: number;
  grace_minutes: number; is_active: boolean;
}

export default async function SchedulesPage() {
  const profile = await requireProfile();
  if (!isManager(profile)) redirect('/dashboard');
  const supabase = await createClient();

  const [routesRes, sitesRes, schedulesRes] = await Promise.all([
    supabase.from('patrol_routes').select('*').eq('is_active', true).order('name'),
    supabase.from('sites').select('*').order('name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('patrol_schedules').select('*').order('name'),
  ]);

  return (
    <>
      <PageHeader title="Patrol Schedules" description="Make patrol routes recurring. Late patrols auto-alert the on-duty supervisor." />
      <SchedulesManager
        routes={(routesRes.data ?? []) as PatrolRoute[]}
        sites={(sitesRes.data ?? []) as Site[]}
        initial={(schedulesRes.data ?? []) as ScheduleRow[]}
      />
    </>
  );
}
