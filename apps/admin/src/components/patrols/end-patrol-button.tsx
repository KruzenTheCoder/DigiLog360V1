'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Square } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function EndPatrolButton({ patrolId, occurrenceId }: { patrolId: number; occurrenceId: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function end() {
    setBusy(true);
    const supabase = createClient();
    const now = new Date().toISOString();
    // The DB trigger computes duration + flips status to 'completed'.
    await supabase.from('patrols').update({ ended_at: now }).eq('id', patrolId);
    if (occurrenceId) {
      await supabase.from('occurrences').update({ status: 'resolved' }).eq('id', occurrenceId);
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <Button size="sm" variant="destructive" onClick={end} disabled={busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} End
    </Button>
  );
}
