'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ClipboardCheck, FileWarning, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { TASK_PRIORITY_COLORS, TASK_PRIORITY_LABELS, type TaskPriority } from '@digilog/shared';

/**
 * Floating toast that pops up the moment something is assigned to the user.
 *
 * Subscribes to the `notifications` table (already known to broadcast — the
 * unread-bell counter in the header uses the same channel) and surfaces a
 * card for two kinds of events:
 *
 *   • `task.assigned`        — new task in the user's queue
 *                              → Open routes to /tasks/[id]
 *   • `occurrence.assigned`  — incident handed off via Log Occurrence's
 *                              assign-to dropdown (the audit_occurrence_
 *                              assignment trigger writes the row)
 *                              → Open routes to /occurrences/[id]
 *
 * Open marks the underlying notification read so the bell counter stays
 * accurate. Dismiss closes just that toast. Auto-fades after 30s.
 */
interface ToastNotif {
  notif_id: number;
  kind: 'task' | 'occurrence';
  target_id: number;
  title: string;
  body: string;
  /** Tasks have a priority; occurrences don't (we tag by severity instead). */
  priority?: TaskPriority;
  severity?: 'critical' | 'high' | 'medium' | 'low';
  due_at: string | null;
  ob_number: string | null;
}

const SEVERITY_COLOR: Record<NonNullable<ToastNotif['severity']>, string> = {
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#d97706',
  low:      '#0ea5e9',
};

export function TaskAssignmentToast({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter();
  const [queue, setQueue] = useState<ToastNotif[]>([]);
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
      const data = (row.data ?? {}) as Record<string, unknown>;
      const kindRaw = String(row.kind ?? '');

      // Task assignment
      if (kindRaw === 'task.assigned') {
        const taskId = Number(data.task_id);
        if (!Number.isFinite(taskId) || taskId <= 0) return null;
        return {
          notif_id: Number(row.id),
          kind: 'task',
          target_id: taskId,
          title: String(row.title ?? 'New task assigned'),
          body: String(row.body ?? ''),
          priority: (data.priority as TaskPriority | undefined) ?? 'normal',
          due_at: (data.due_at as string | null | undefined) ?? null,
          ob_number: (data.ob_number as string | null | undefined) ?? null,
        };
      }

      // Occurrence assignment
      if (kindRaw === 'occurrence.assigned') {
        const occId = Number(data.occurrence_id);
        if (!Number.isFinite(occId) || occId <= 0) return null;
        return {
          notif_id: Number(row.id),
          kind: 'occurrence',
          target_id: occId,
          title: String(row.title ?? 'New occurrence assigned'),
          body: String(row.body ?? ''),
          severity: (data.severity as ToastNotif['severity']) ?? 'medium',
          due_at: null,
          ob_number: (data.ob_number as string | null | undefined) ?? null,
        };
      }
      return null;
    }

    const channel = supabase
      .channel(`assignment-toast-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notif = fromRow(payload.new as Record<string, unknown>);
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
    try {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.notif_id);
    } catch { /* non-fatal */ }
    router.push(n.kind === 'task' ? `/tasks/${n.target_id}` : `/occurrences/${n.target_id}`);
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
  const isOcc = notif.kind === 'occurrence';
  const accentColor = isOcc
    ? (notif.severity ? SEVERITY_COLOR[notif.severity] : '#667eea')
    : (notif.priority ? TASK_PRIORITY_COLORS[notif.priority] : '#667eea');
  const eyebrow = isOcc ? 'New occurrence assigned' : 'New task assigned';
  const chipLabel = isOcc
    ? (notif.severity ?? '').toUpperCase() || 'OCCURRENCE'
    : (notif.priority ? TASK_PRIORITY_LABELS[notif.priority] : 'TASK');
  const Icon = isOcc ? FileWarning : ClipboardCheck;
  const openLabel = isOcc ? 'Open occurrence' : 'Open task';
  const stripTitle = notif.title.replace(/^(New (task|occurrence): |Assigned: )/i, '');

  return (
    <div
      className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] shadow-2xl animate-in slide-in-from-bottom-4 fade-in"
      role="alert"
    >
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}99)` }} />
      <div className="flex items-start gap-3 p-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${accentColor}22`, color: accentColor }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
              {eyebrow}
            </p>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: `${accentColor}22`, color: accentColor }}
            >
              {chipLabel}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-semibold text-[hsl(var(--foreground))]">
            {stripTitle}
          </p>
          <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">
            Hi {userName.split(' ')[0]} — {notif.body || `You have been assigned a new ${notif.kind}.`}
            {notif.ob_number && <> · <strong>{notif.ob_number}</strong></>}
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
              <CheckCircle2 className="h-3.5 w-3.5" /> {openLabel}
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
