'use client';

// Escalate an open occurrence up the reporting line.
//
// The target is resolved server-side from the organogram, not chosen here —
// escalation is meant to follow the chain of command, not let someone pick a
// convenient recipient. The RPC creates a task for that person, which in turn
// triggers the existing task.assigned email, so one action lands in both their
// inbox and their mailbox.

import { useState } from 'react';
import { AlertCircle, ArrowUpCircle, Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface Escalation {
  level: number;
  from_name: string | null;
  to_name: string | null;
  reason: string | null;
  created_at: string;
}

export function EscalateCard({
  occurrenceId, status, escalatedToName, escalationLevel, history,
}: {
  occurrenceId: number;
  status: string;
  escalatedToName: string | null;
  escalationLevel: number;
  history: Escalation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const settled = status === 'resolved' || status === 'closed';

  async function escalate() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    const { data, error: err } = await sb.rpc('escalate_occurrence', {
      p_occurrence_id: occurrenceId,
      p_reason: reason.trim() || null,
    });
    setBusy(false);
    if (err) {
      // The function raises readable messages — "no one above you is recorded
      // in the organogram", "already at the top of the reporting line".
      setError(err.message);
      return;
    }
    const d = data as { escalated_to_name?: string; level?: number } | null;
    setDone(`Escalated to ${d?.escalated_to_name ?? 'the next level'} — a task and an email are on their way.`);
    setOpen(false);
    setReason('');
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Escalation</p>
          {escalationLevel > 0 && (
            <Badge color="#d97706">Level {escalationLevel}</Badge>
          )}
        </div>

        {escalatedToName ? (
          <p className="text-sm text-[hsl(var(--muted))]">
            Currently with <strong className="text-[hsl(var(--foreground))]">{escalatedToName}</strong>.
          </p>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">
            Not escalated. Raising it sends this to the person above you in the organogram.
          </p>
        )}

        {done && (
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
            <Check className="mt-0.5 h-4 w-4 shrink-0" /><span>{done}</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
          </div>
        )}

        {settled ? (
          <p className="text-xs text-[hsl(var(--muted))]">
            This occurrence is {status} — there is nothing to escalate.
          </p>
        ) : open ? (
          <div className="space-y-2">
            <div>
              <Label>Why are you escalating?</Label>
              <Textarea
                rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. No response from site for three hours."
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={escalate} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
                Escalate
              </Button>
              <Button variant="ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" onClick={() => { setOpen(true); setDone(null); }}>
            <ArrowUpCircle className="h-4 w-4" />
            {escalationLevel > 0 ? 'Escalate further' : 'Escalate'}
          </Button>
        )}

        {history.length > 0 && (
          <ul className="space-y-1.5 border-t pt-3 text-xs">
            {history.map((h, i) => (
              <li key={i}>
                <span className="font-medium">Level {h.level}</span>
                {' · '}{h.from_name ?? 'Someone'} → {h.to_name ?? 'Unknown'}
                <span className="text-[hsl(var(--muted))]">
                  {' · '}{new Date(h.created_at).toLocaleString()}
                </span>
                {h.reason && <p className="text-[hsl(var(--muted))]">&ldquo;{h.reason}&rdquo;</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
