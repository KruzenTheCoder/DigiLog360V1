'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ClipboardCheck, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TASK_PRIORITY_COLORS, TASK_PRIORITY_LABELS, type Task } from '@digilog/shared';

type ToastTask = Pick<Task, 'id' | 'title' | 'priority' | 'due_at' | 'assigned_by_name' | 'ob_number'>;

/**
 * Floating toast that pops up the moment a task lands in the user's queue.
 *
 * Listens for `INSERT`s on the tasks table where `assigned_to = me`, plus
 * `UPDATE`s where the row's new assigned_to is me. Falls back gracefully if
 * realtime isn't enabled on the table — a Postgres trigger (notifications
 * insert) still records the event and the bell counter picks it up.
 *
 * The toast lives at the root of the AppShell so it appears on every page.
 * Open → routes to /tasks/[id]. Dismiss → closes only this notification.
 * Auto-dismisses after 30 s if the user takes no action.
 */
export function TaskAssignmentToast({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter();
  const [queue, setQueue] = useState<ToastTask[]>([]);
  // De-dupe IDs we've already shown — covers the case where INSERT and an
  // immediate UPDATE both fire for the same row.
  const seenRef = useRef<Set<number>>(new Set());

  const push = useCallback((task: ToastTask) => {
    if (seenRef.current.has(task.id)) return;
    seenRef.current.add(task.id);
    setQueue((q) => [...q, task]);
    // Auto-dismiss after 30 s if untouched.
    setTimeout(() => {
      setQueue((q) => q.filter((t) => t.id !== task.id));
    }, 30_000);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let cancelled = false;

    async function fetchTask(id: number) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('tasks')
        .select('id, title, priority, due_at, assigned_by_name, ob_number, assigned_to')
        .eq('id', id)
        .single();
      if (!cancelled && data && data.assigned_to === userId) push(data as ToastTask);
    }

    // One channel covers INSERT + UPDATE because the filter ensures we only
    // get rows assigned to this user.
    const channel = supabase
      .channel(`task-toast-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${userId}` },
        (payload) => {
          const row = payload.new as ToastTask;
          push({
            id: row.id,
            title: row.title,
            priority: row.priority,
            due_at: row.due_at,
            assigned_by_name: row.assigned_by_name,
            ob_number: row.ob_number,
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${userId}` },
        (payload) => {
          // UPDATE fires for any change on a row assigned to me. We only want
          // pop-ups for fresh assignments — refetch and rely on the seen-set
          // to avoid double-firing on subsequent edits.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const id = (payload.new as any)?.id;
          if (typeof id === 'number') fetchTask(id);
        },
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [userId, push]);

  function dismiss(id: number) {
    setQueue((q) => q.filter((t) => t.id !== id));
  }

  function open(id: number) {
    dismiss(id);
    router.push(`/tasks/${id}`);
  }

  if (queue.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {queue.map((t) => (
        <ToastCard
          key={t.id}
          task={t}
          userName={userName}
          onOpen={() => open(t.id)}
          onDismiss={() => dismiss(t.id)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  task, userName, onOpen, onDismiss,
}: {
  task: ToastTask;
  userName: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const priorityColor = TASK_PRIORITY_COLORS[task.priority] ?? '#667eea';
  return (
    <div
      className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] shadow-2xl animate-in slide-in-from-bottom-4 fade-in"
      role="alert"
    >
      {/* Accent bar */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${priorityColor}, ${priorityColor}99)` }} />
      <div className="flex items-start gap-3 p-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${priorityColor}22`, color: priorityColor }}
        >
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
              New task assigned
            </p>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: `${priorityColor}22`, color: priorityColor }}
            >
              {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-[hsl(var(--foreground))]">
            {task.title}
          </p>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">
            Hi {userName.split(' ')[0]} —
            {task.assigned_by_name ? ` ${task.assigned_by_name} assigned this to you.` : ' assigned to you.'}
            {task.ob_number && <> · Linked to <strong>{task.ob_number}</strong></>}
          </p>
          {task.due_at && (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
              Due {new Date(task.due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onOpen}
              className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Open task
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted))] hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="-mt-1 -mr-1 rounded-lg p-1 text-[hsl(var(--muted))] hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
