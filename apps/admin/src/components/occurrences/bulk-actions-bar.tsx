'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckSquare, Square, X, Loader2, ShieldCheck, Lock, UserCog } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select, Textarea, Label } from '@/components/ui/input';
import {
  OCCURRENCE_STATUSES, STATUS_LABELS,
  type OccurrenceStatus, type AppRole,
} from '@digilog/shared';

interface Props {
  selectedIds: number[];
  onClear: () => void;
  authorId: string;
  authorName: string;
  assignables: { id: string; full_name: string | null; email: string | null; role: AppRole }[];
}

type Action = 'status' | 'assign' | 'close' | null;

export function BulkActionsBar({ selectedIds, onClear, authorId, authorName, assignables }: Props) {
  const router = useRouter();
  const [action, setAction] = useState<Action>(null);
  const [status, setStatus] = useState<OccurrenceStatus>('acknowledged');
  const [assignee, setAssignee] = useState<string>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (selectedIds.length === 0) return null;

  async function runStatusUpdate(targetStatus: OccurrenceStatus) {
    setBusy(true);
    const supabase = createClient();

    // Update occurrences in chunks of 100 (Postgrest IN clause cap).
    for (let i = 0; i < selectedIds.length; i += 100) {
      const slice = selectedIds.slice(i, i + 100);
      // Timeline note first, then the status patch — same order as the single
      // update dialog, so alert emails carry the note instead of firing twice.
      if (note.trim()) {
        await supabase.from('occurrence_updates').insert(
          slice.map((id) => ({
            occurrence_id: id, notes: note.trim(), status: targetStatus,
            updated_by: authorId, updated_by_name: authorName,
          })),
        );
      }
      await supabase.from('occurrences')
        .update({ status: targetStatus, last_sla_update_at: new Date().toISOString() })
        .in('id', slice);
    }
    // Fire-and-forget: flush the email outbox so update emails for assigned
    // occurrences go out immediately (cron catches it otherwise).
    void supabase.functions.invoke('task-alerts', { body: {} }).catch(() => {});
    setBusy(false);
    setAction(null);
    setNote('');
    onClear();
    router.refresh();
  }

  async function runAssign() {
    setBusy(true);
    const supabase = createClient();
    for (let i = 0; i < selectedIds.length; i += 100) {
      const slice = selectedIds.slice(i, i + 100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('occurrences')
        .update({ assigned_to: assignee || null })
        .in('id', slice);
    }
    // Fire-and-forget: flush the email outbox so assignment emails go out
    // immediately (cron catches it otherwise).
    if (assignee) void supabase.functions.invoke('task-alerts', { body: {} }).catch(() => {});
    setBusy(false);
    setAction(null);
    onClear();
    router.refresh();
  }

  return (
    <>
      <div className="sticky bottom-4 z-30 mx-auto mt-4 flex w-fit items-center gap-2 rounded-full border bg-[hsl(var(--surface))] px-4 py-2 shadow-lg">
        <CheckSquare className="h-4 w-4 text-brand" />
        <span className="text-sm font-semibold">{selectedIds.length} selected</span>
        <span className="mx-2 h-4 w-px bg-slate-300 dark:bg-slate-700" />
        <Button size="sm" variant="secondary" onClick={() => setAction('status')}>
          <ShieldCheck className="h-4 w-4" /> Acknowledge
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAction('close')}>
          <Lock className="h-4 w-4" /> Close
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAction('assign')}>
          <UserCog className="h-4 w-4" /> Assign
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} title="Clear selection">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Status / acknowledge dialog */}
      <Dialog
        open={action === 'status' || action === 'close'}
        onClose={() => setAction(null)}
        title={action === 'close' ? `Close ${selectedIds.length} occurrences` : `Update status of ${selectedIds.length} occurrences`}
      >
        <div className="space-y-3">
          {action === 'status' && (
            <div>
              <Label>New status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value as OccurrenceStatus)}>
                {OCCURRENCE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </Select>
            </div>
          )}
          <div>
            <Label>Timeline note (applied to each)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. ‘Reviewed in shift handover — all clear’"
              className="min-h-[80px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              onClick={() => runStatusUpdate(action === 'close' ? 'closed' : status)}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply to {selectedIds.length}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Assign dialog */}
      <Dialog
        open={action === 'assign'}
        onClose={() => setAction(null)}
        title={`Assign ${selectedIds.length} occurrences`}
      >
        <div className="space-y-3">
          <div>
            <Label>Assignee</Label>
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">— Unassign —</option>
              {assignables.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
            <Button onClick={runAssign} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply
            </Button>
          </div>
        </div>
      </Dialog>

      <Square className="hidden" />
    </>
  );
}
