import Link from 'next/link';
import { ArrowLeft, Radio } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { type HistoryRow } from '@/components/occurrences/history-occurrences';
import { HistoryTabs } from '@/components/occurrences/history-tabs';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import type { PatrolDetailed } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Site scope — admin / super_user see every site; everyone else is
  // restricted to the sites they're assigned to.
  const profSiteIds = (profile as unknown as { site_ids?: string[] | null }).site_ids ?? [];
  const ownSites = Array.from(new Set([
    ...(Array.isArray(profSiteIds) ? profSiteIds : []),
    ...(profile.site_id ? [profile.site_id] : []),
  ]));
  const isUnscopedRole = profile.role === 'admin' || profile.role === 'super_user';

  const fetchOccurrences = async () => {
    let occQ = supabase.from('occurrences')
      .select('id, ob_number, occurrence_type, severity, status, site_name, site_id, logged_by_name, incident_at, closed_at, description')
      .in('status', ['resolved', 'closed'])
      .order('closed_at', { ascending: false })
      .limit(500);

    if (!isUnscopedRole && ownSites.length > 0) {
      occQ = occQ.in('site_id', ownSites);
    }
    
    return (await occQ).data ?? [];
  };

  const fetchPatrols = async () => {
    const base = () => supabase.from('patrols_detailed').select('*')
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false })
      .limit(200);

    if (!isUnscopedRole && ownSites.length > 0) {
      // The patrols_detailed view computes scan counts. Doing this over an IN() 
      // clause causes Postgres to evaluate the subquery before sorting, timing out.
      // Running per-site forces the index limit first.
      const results = await Promise.all(ownSites.map(sid => base().eq('site_id', sid)));
      const merged = results.flatMap(r => r.data ?? []);
      merged.sort((a, b) => new Date(b.ended_at ?? 0).getTime() - new Date(a.ended_at ?? 0).getTime());
      return merged.slice(0, 200);
    }
    return (await base()).data ?? [];
  };

  const [closed, patrols] = await Promise.all([fetchOccurrences(), fetchPatrols()]);

  const occ = (closed ?? []) as unknown as HistoryRow[];
  const pat = (patrols ?? []) as PatrolDetailed[];

  return (
    <>
      <RealtimeRefresh tables={['occurrences', 'patrols', 'checkpoint_scans']} />
      <PageHeader
        title="History — Closed Occurrences & Completed Patrols"
        description="Resolved occurrences and completed patrols."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/occurrences">
              <Button variant="secondary"><Radio className="h-4 w-4" /> View Live Occurrences</Button>
            </Link>
            <Link href="/menu">
              <Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back to Menu</Button>
            </Link>
          </div>
        }
      />

      <HistoryTabs occ={occ} pat={pat} />
    </>
  );
}
