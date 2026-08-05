'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import {
  TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS,
  type Task, type TaskUpdate, type TaskStatus,
} from '@digilog/shared';

export function TaskDetail({
  task: initialTask, updates: initialUpdates, currentUserId, currentUserName,
}: {
  task: Task;
  updates: TaskUpdate[];
  currentUserId: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const [task, setTask] = useState<Task>(initialTask);
  const [updates, setUpdates] = useState<TaskUpdate[]>(initialUpdates);

  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [notes, setNotes] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function postUpdate() {
    if (status === task.status && !notes.trim()) {
      setError('Either change status or add a note.');
      return;
    }
    setBusy(true); setError(null);
    const supabase = createClient();

    // Insert the audit row first so we keep history regardless of the task update.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any).from('task_updates').insert({
      task_id: task.id,
      previous_status: task.status,
      new_status: status,
      notes: notes.trim() || null,
      updated_by: currentUserId,
      updated_by_name: currentUserName,
    });
    if (insErr) { setError(insErr.message); setBusy(false); return; }

    const patch: Partial<Task> = { status };
    if ((status === 'done' || status === 'cancelled') && completionNotes.trim()) {
      patch.completion_notes = completionNotes.trim();
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr, data: updated } = await (supabase as any)
      .from('tasks').update(patch).eq('id', task.id).select().single();
    setBusy(false);
    if (upErr) { setError(upErr.message); return; }

    // Fire-and-forget: flush the email outbox so update/completion emails
    // reach the assigner immediately (cron would catch it anyway).
    void supabase.functions.invoke('task-alerts', { body: {} }).catch(() => {});

    setTask(updated as Task);
    setUpdates((prev) => [
      {
        id: -Date.now(),
        task_id: task.id,
        previous_status: task.status,
        new_status: status,
        notes: notes.trim() || null,
        updated_by: currentUserId,
        updated_by_name: currentUserName,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setNotes(''); setCompletionNotes('');
    router.refresh();
  }

  const done = task.status === 'done' || task.status === 'cancelled';

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Details</CardTitle>
              <div className="flex gap-1">
                <Badge color={TASK_PRIORITY_COLORS[task.priority]}>{TASK_PRIORITY_LABELS[task.priority]}</Badge>
                <Badge color={TASK_STATUS_COLORS[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Assigned to" value={task.assigned_to_name} />
              <Field label="Assigned by" value={task.assigned_by_name} />
              <Field label="Due" value={task.due_at ? formatDateTime(task.due_at) : '—'} />
              <Field label="Created" value={formatDateTime(task.created_at)} />
              {task.completed_at && <Field label="Completed" value={formatDateTime(task.completed_at)} />}
            </dl>
            {task.description && (
              <div className="mt-4">
                <dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">Description</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">{task.description}</dd>
              </div>
            )}
            {task.completion_notes && (
              <div className="mt-4">
                <dt className="flex items-center gap-1 text-xs uppercase tracking-wide text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> Completion notes
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">{task.completion_notes}</dd>
              </div>
            )}
          </CardContent>
        </Card>

        {!done && (
          <Card>
            <CardHeader><CardTitle>Update status</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>New status</Label>
                  <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                    {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
                  </Select>
                </div>
              </div>
              <div className="mt-3">
                <Label>Notes (visible in the timeline)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[80px]"
                  placeholder="What did you do? What's blocking?" />
              </div>
              {(status === 'done' || status === 'cancelled') && (
                <div className="mt-3">
                  <Label>Completion notes (saved on the task)</Label>
                  <Input value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)}
                    placeholder="Short outcome summary" />
                </div>
              )}
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-4 flex justify-end">
                <Button onClick={postUpdate} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Post update
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="h-fit">
        <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
        <CardContent>
          {updates.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted))]">No updates yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l pl-4">
              {updates.map((u) => (
                <li key={u.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand" />
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {u.previous_status && (
                      <>
                        <Badge color={TASK_STATUS_COLORS[u.previous_status]}>{TASK_STATUS_LABELS[u.previous_status]}</Badge>
                        <span className="text-[hsl(var(--muted))]">→</span>
                      </>
                    )}
                    <Badge color={TASK_STATUS_COLORS[u.new_status]}>{TASK_STATUS_LABELS[u.new_status]}</Badge>
                    <span className="text-[hsl(var(--muted))]">{formatDateTime(u.created_at)}</span>
                  </div>
                  {u.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{u.notes}</p>}
                  <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">— {u.updated_by_name ?? 'Unknown'}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">{label}</dt>
      <dd className="mt-0.5 text-sm">{value ?? '—'}</dd>
    </div>
  );
}
