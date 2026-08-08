'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, type AppRole } from '@digilog/shared';

interface Assignable { id: string; full_name: string | null; email: string | null; role: AppRole }

export function AssignmentCard({
  occurrenceId,
  currentAssigneeId,
  currentAssigneeName,
  assignables,
}: {
  occurrenceId: number;
  currentAssigneeId: string | null;
  currentAssigneeName: string | null;
  assignables: Assignable[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<string>(currentAssigneeId ?? '');
  const [busy, setBusy] = useState(false);

  async function commit(newId: string | null) {
    setBusy(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('occurrences')
      .update({ assigned_to: newId })
      .eq('id', occurrenceId);
    setBusy(false);
    if (error) { alert(error.message); return; }
    // Fire-and-forget: flush the email outbox so the new reviewer's
    // "occurrence assigned" email goes out immediately (cron catches it
    // otherwise).
    if (newId) void supabase.functions.invoke('task-alerts', { body: {} }).catch(() => {});
    setPicking(false);
    router.refresh();
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted))]">
          Assigned To
        </p>
        {!picking && (
          <Button size="sm" variant="ghost" onClick={() => setPicking(true)} title="Change assignee">
            <UserPlus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!picking ? (
        currentAssigneeId ? (
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{currentAssigneeName ?? 'Unknown'}</p>
            <Button size="icon" variant="ghost" onClick={() => commit(null)} title="Unassign" disabled={busy}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-sm italic text-[hsl(var(--muted))]">Unassigned</p>
        )
      ) : (
        <div className="space-y-2">
          <Label>Pick a reviewer</Label>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— Unassigned —</option>
            {assignables.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.full_name ?? p.email)} · {ROLE_LABELS[p.role]}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPicking(false)}>Cancel</Button>
            <Button size="sm" onClick={() => commit(target || null)} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
            </Button>
          </div>
        </div>
      )}

      {currentAssigneeId && !picking && (
        <div className="mt-2"><Badge color="#3b82f6">Owner set</Badge></div>
      )}
    </Card>
  );
}
