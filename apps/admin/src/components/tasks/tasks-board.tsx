'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Plus, Filter, Loader2, AlertTriangle, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Textarea, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import {
  TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS,
  type Task, type TaskStatus, type TaskPriority, type AppRole,
} from '@digilog/shared';

interface Assignable { id: string; full_name: string | null; email: string | null; role: AppRole; roles: AppRole[] }

type Scope = 'mine' | 'all' | 'created';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'mine',    label: 'Assigned to me' },
  { key: 'created', label: 'I created' },
  { key: 'all',     label: 'All tasks' },
];

export function TasksBoard({
  initial, scope, currentUserId, currentUserName, assignables,
}: {
  initial: Task[]; scope: Scope;
  currentUserId: string; currentUserName: string;
  assignables: Assignable[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [items, setItems] = useState<Task[]>(initial);
  const [addOpen, setAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'open_only' | 'all'>('open_only');
  const [q, setQ] = useState('');

  useEffect(() => { setItems(initial); }, [initial]);

  // Realtime updates so the board reflects changes from anywhere.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel('tasks-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [router]);

  function setScope(next: Scope) {
    const params = new URLSearchParams(sp.toString());
    params.set('scope', next);
    router.push(`${pathname}?${params.toString()}`);
  }

  const filtered = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return items.filter((t) => {
      if (statusFilter === 'open_only' && (t.status === 'done' || t.status === 'cancelled')) return false;
      if (statusFilter !== 'all' && statusFilter !== 'open_only' && t.status !== statusFilter) return false;
      if (needle) {
        const hay = `${t.title} ${t.description ?? ''} ${t.assigned_to_name ?? ''} ${t.ob_number ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [items, statusFilter, q]);

  const now = Date.now();
  const overdue = filtered.filter((t) => t.due_at && new Date(t.due_at).getTime() < now && t.status !== 'done' && t.status !== 'cancelled');

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${scope === s.key ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Text search across title / description / assignee / OB. */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, assignee, OB…"
              className="w-56 pl-9"
            />
          </div>
          <Filter className="h-4 w-4 text-[hsl(var(--muted))]" />
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'open_only' | 'all')}>
            <option value="open_only">Open (default)</option>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
            <option value="all">All</option>
          </Select>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> New task</Button>
        </div>
      </div>

      {overdue.length > 0 && (
        <Card className="mb-4 border-red-300 bg-red-50/50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <strong>{overdue.length}</strong> task{overdue.length === 1 ? '' : 's'} overdue.
          </div>
        </Card>
      )}

      <Card className="p-4">
        <Table>
          <THead>
            <TR>
              <TH>Title</TH><TH>Priority</TH><TH>Status</TH>
              <TH>Assignee</TH><TH>Due</TH><TH>Linked OB</TH><TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((t) => {
              const isOverdue = t.due_at && new Date(t.due_at).getTime() < now && t.status !== 'done' && t.status !== 'cancelled';
              return (
                <TR key={t.id}>
                  <TD>
                    <Link href={`/tasks/${t.id}`} prefetch={false} className="font-medium text-brand hover:underline">
                      {t.title}
                    </Link>
                    {t.description && <p className="line-clamp-1 text-xs text-[hsl(var(--muted))]">{t.description}</p>}
                  </TD>
                  <TD><Badge color={TASK_PRIORITY_COLORS[t.priority]}>{TASK_PRIORITY_LABELS[t.priority]}</Badge></TD>
                  <TD><Badge color={TASK_STATUS_COLORS[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge></TD>
                  <TD className="text-sm">{t.assigned_to_name ?? '—'}</TD>
                  <TD className={`whitespace-nowrap text-xs ${isOverdue ? 'font-semibold text-red-600' : 'text-[hsl(var(--muted))]'}`}>
                    {t.due_at ? formatDateTime(t.due_at) : '—'}
                  </TD>
                  <TD>
                    {t.ob_number ? (
                      <Link href={`/occurrences/${t.occurrence_id}`} className="text-xs text-brand hover:underline">
                        {t.ob_number}
                      </Link>
                    ) : '—'}
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">{formatDateTime(t.created_at)}</TD>
                </TR>
              );
            })}
            {filtered.length === 0 && (
              <TR><TD colSpan={7} className="py-8 text-center text-[hsl(var(--muted))]">
                Nothing here — try changing the filter or scope.
              </TD></TR>
            )}
          </TBody>
        </Table>
      </Card>

      <NewTaskDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        assignables={assignables}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onCreated={() => { setAddOpen(false); router.refresh(); }}
      />
    </>
  );
}

function NewTaskDialog({
  open, onClose, assignables, currentUserId, currentUserName, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  assignables: Assignable[];
  currentUserId: string;
  currentUserName: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueAt, setDueAt] = useState('');
  const [obNumber, setObNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim() || !assignedTo) {
      setError('Title and assignee are required.');
      return;
    }
    setBusy(true); setError(null);
    const supabase = createClient();
    const assignee = assignables.find((a) => a.id === assignedTo);

    // Optionally resolve OB number → occurrence id (best-effort).
    let occurrence_id: number | null = null;
    if (obNumber.trim()) {
      const { data: occ } = await supabase.from('occurrences')
        .select('id').eq('ob_number', obNumber.trim().toUpperCase()).maybeSingle();
      occurrence_id = (occ as { id: number } | null)?.id ?? null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any).from('tasks').insert({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status: 'open',
      assigned_to: assignedTo,
      assigned_to_name: assignee?.full_name ?? assignee?.email ?? null,
      assigned_by: currentUserId,
      assigned_by_name: currentUserName,
      occurrence_id,
      ob_number: obNumber.trim() ? obNumber.trim().toUpperCase() : null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setBusy(false);
    if (insErr) { setError(insErr.message); return; }
    setTitle(''); setDescription(''); setAssignedTo(''); setPriority('normal'); setDueAt(''); setObNumber('');
    onCreated();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New task">
      <div className="space-y-3">
        <div>
          <Label>Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Investigate boom gate fault" />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[80px]"
            placeholder="What needs to happen?" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Assignee *</Label>
            <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">— pick a person —</option>
              {assignables.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.full_name ?? p.email)} — {p.role}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Due (optional)</Label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div>
            <Label>Linked OB # (optional)</Label>
            <Input value={obNumber} onChange={(e) => setObNumber(e.target.value.toUpperCase())} placeholder="OB0042" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create task
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
