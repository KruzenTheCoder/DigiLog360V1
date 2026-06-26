'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ClipboardCheck, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TASK_PRIORITY_COLORS, TASK_PRIORITY_LABELS, type TaskPriority } from '@digilog/shared';

/**
 * Floating toast that pops up the moment a task lands in the user's queue.
 *
 * **How it works** — we subscribe to the `notifications` table, not the
 * `tasks` table. The `audit_task_assignment` trigger writes one notification
 * row of `kind='task.assigned'` per assignment, and the same publication is
 * already used by the unread-bell counter in the header (so we know it
 * works without extra setup). This avoids depending on Realtime being
 * enabled on `tasks` separately.
 *
 * The notification body carries the task id in its `data.task_id` field;
 * Open routes to `/tasks/[id]`. Dismiss closes the toast.
 * Auto-dismiss after 30 s if untouched.
 */
interface ToastNotif {
  notif_id: number;
  task_id: number;
  title: string;
  body: string;
  priority: TaskPriority;
  due_at: string | null;
  ob_number: string | null;
}

export function TaskAssignmentToast({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter();
  const [queue, setQueue] = useState<ToastNotif[]>([]);
  // De-dupe so the same notification row never pops twice.
  const seenRef = useRef<Set<number>>(new Set());

  const push = useCallback((n: ToastNotif) => {
    if (seenRef.current.has(n.notif_id)) return;
    seenRef.current.add(n.notif_id);
    setQueue((q) => [...q, n]);
    setTimeout(() => setQueue((q) => q.filter((x) => x.notif_id !== n.notif_id)), 30_000);
  }, []);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    function fromRow(row: Record<string, unknown>): ToastNotif | null {
      // The trigger writes:
      //   kind  = 'task.assigned'
      //   data  = { task_id, priority, due_at }
      //   title = 'New task: <title>'
      //   body  = short description / OB reference
      // The toast falls back to sensible defaults so it never silently skips.
      const data = (row.data ?? {}) as Record<string, unknown>;
      const taskId = Number(data.task_id);
      if (!Number.isFinite(taskId) || taskId <= 0) return null;
      return {
        notif_id: Number(row.id),
        task_id: taskId,
        title: String(row.title ?? 'New task assigned'),
        body: String(row.body ?? ''),
        priority: (data.priority as TaskPriority | undefined) ?? 'normal',
        due_at: (data.due_at as string | null | undefined) ?? null,
        ob_number: (data.ob_number as string | null | undefined) ?? null,
      };
    }

    const channel = supabase
      .channel(`task-toast-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.kind !== 'task.assigned') return;
          const notif = fromRow(row);
          if (notif) push(notif);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, push]);

  function dismiss(notifId: number) {
    setQueue((q) => q.filter((t) => t.notif_id !== notifId));
  }

  async function open(n: ToastNotif) {
    dismiss(n.notif_id);
    // Mark the underlying notification as read so the bell counter stays accurate.
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.notif_id);
    } catch { /* non-fatal — the inbox will mark it on next visit */ }
    router.push(`/tasks/${n.task_id}`);
  }

  if (queue.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      {queue.map((n) => (
        <ToastCard
          key={n.notif_id}
          notif={n}
          userName={userName}
          onOpen={() => open(n)}
          onDismiss={() => dismiss(n.notif_id)}
        />
      ))}
    </div>
  );
}

function ToastCard({
  notif, userName, onOpen, onDismiss,
}: {
  notif: ToastNotif;
  userName: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const priorityColor = TASK_PRIORITY_COLORS[notif.priority] ?? '#667eea';
  return (
    <div
      className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] shadow-2xl animate-in slide-in-from-bottom-4 fade-in"
      role="alert"
    >
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
              {TASK_PRIORITY_LABELS[notif.priority] ?? notif.priority}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-[hsl(var(--foreground))]">
            {/* The trigger prepends "New task: " — strip it for cleaner copy. */}
            {notif.title.replace(/^New task:\s*/i, '')}
          </p>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">
            Hi {userName.split(' ')[0]} — {notif.body || 'You have been assigned a new task.'}
            {notif.ob_number && <> · Linked to <strong>{notif.ob_number}</strong></>}
          </p>
          {notif.due_at && (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
              Due {new Date(notif.due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
