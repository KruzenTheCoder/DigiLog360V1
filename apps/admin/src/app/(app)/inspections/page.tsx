import { createClient } from '@/lib/supabase/server';
import { requireProfile, isManager } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { InspectionCalendar } from '@/components/inspections/inspection-calendar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export interface VisitRow {
  id: string;
  schedule_id: string | null;
  site_id: string;
  assigned_to: string | null;
  title: string;
  instructions: string | null;
  due_at: string;
  window_end: string;
  status: string;
  check_in_at: string | null;
  check_in_distance_m: number | null;
  check_in_within_geofence: boolean | null;
  completed_at: string | null;
  checklist: Array<{ id: string; label: string; done?: boolean; note?: string }>;
  findings: string | null;
  outcome: string | null;
}

export default async function InspectionsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  // A window either side of today so month navigation is instant and doesn't
  // round-trip. RLS already limits this to the caller's own visits unless they
  // supervise, so no extra filtering is needed here.
  const from = new Date(Date.now() - 60 * 864e5).toISOString();
  const to = new Date(Date.now() + 120 * 864e5).toISOString();

  const [visitsRes, sitesRes, peopleRes] = await Promise.all([
    sb.from('inspection_visits')
      .select('id, schedule_id, site_id, assigned_to, title, instructions, due_at, window_end, status, check_in_at, check_in_distance_m, check_in_within_geofence, completed_at, checklist, findings, outcome')
      .gte('due_at', from).lte('due_at', to)
      .order('due_at', { ascending: true }),
    sb.from('sites').select('id, name, latitude, longitude, geofence_radius_m').order('name'),
    sb.from('profiles').select('id, full_name'),
  ]);

  return (
    <>
      <PageHeader
        title="Site Inspections"
        description="Scheduled inspections by date. Open one to check in on site and file the report."
      />
      {isManager(profile) && (
        <div className="mb-4 flex justify-end">
          <Link href="/inspections/schedules">
            <Button variant="secondary">Manage schedules</Button>
          </Link>
        </div>
      )}
      <InspectionCalendar
        visits={(visitsRes.data ?? []) as VisitRow[]}
        sites={(sitesRes.data ?? []) as Array<{ id: string; name: string; latitude: number | null; longitude: number | null }>}
        people={(peopleRes.data ?? []) as Array<{ id: string; full_name: string | null }>}
        currentUserId={(profile as unknown as { id: string }).id}
      />
    </>
  );
}
