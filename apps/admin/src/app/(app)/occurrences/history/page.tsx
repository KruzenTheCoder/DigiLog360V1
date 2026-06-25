import Link from 'next/link';
import { ArrowLeft, Radio, Footprints } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { HistoryOccurrences, type HistoryRow } from '@/components/occurrences/history-occurrences';
import { CompletedPatrols } from '@/components/occurrences/completed-patrols';
import type { PatrolDetailed } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: closed }, { data: patrols }] = await Promise.all([
    supabase.from('occurrences')
      .select('id, ob_number, occurrence_type, severity, status, site_name, logged_by_name, incident_at, closed_at, description')
      .in('status', ['resolved', 'closed'])
      .order('closed_at', { ascending: false }).limit(500),
    supabase.from('patrols_detailed').select('*')
      .not('ended_at', 'is', null)
      .order('ended_at', { ascending: false }).limit(200),
  ]);

  const occ = (closed ?? []) as unknown as HistoryRow[];
  const pat = (patrols ?? []) as PatrolDetailed[];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">History — Closed Occurrences &amp; Completed Patrols</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted))]">Resolved occurrences and completed patrols.</p>
        </div>
        <div className="flex gap-2">
          {/* Jump anchor — instantly scrolls to the Completed Patrols section
              further down the page so users don't have to scroll past every
              closed occurrence first. */}
          <a href="#completed-patrols">
            <Button variant="secondary"><Footprints className="h-4 w-4" /> Jump to Patrols ({pat.length})</Button>
          </a>
          <Link href="/occurrences">
            <Button variant="secondary"><Radio className="h-4 w-4" /> View Live Occurrences</Button>
          </Link>
          <Link href="/menu">
            <Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Back to Menu</Button>
          </Link>
        </div>
      </div>

      <HistoryOccurrences rows={occ} />

      <div className="mt-5">
        <CompletedPatrols patrols={pat} />
      </div>
    </>
  );
}
