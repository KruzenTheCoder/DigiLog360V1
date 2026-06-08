'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Trash2, CheckCheck, AlertTriangle, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';

export interface NotificationRow {
  id: number;
  org_id: string | null;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const KIND_META: Record<string, { color: string; icon: typeof Bell }> = {
  'sla.breach': { color: '#dc2626', icon: AlertTriangle },
  'sla.update_due': { color: '#ea580c', icon: Bell },
  'manager.acknowledged': { color: '#16a34a', icon: ShieldCheck },
  'manager.escalated': { color: '#ea580c', icon: AlertTriangle },
  'manager.rejected': { color: '#dc2626', icon: AlertTriangle },
  'occurrence.assigned': { color: '#3b82f6', icon: Bell },
  system: { color: '#64748b', icon: Bell },
};

export function NotificationsList({ initial }: { initial: NotificationRow[] }) {
  const [items, setItems] = useState<NotificationRow[]>(initial);
  const supabase = createClient();

  // Realtime: append new notifications as they arrive.
  useEffect(() => {
    const channel = supabase
      .channel('notifications-self')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const n = payload.new as NotificationRow;
        setItems((prev) => [n, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  async function markRead(id: number) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('notifications')
      .update({ read_at: now })
      .is('read_at', null);
  }

  async function remove(id: number) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('notifications').delete().eq('id', id);
  }

  const unread = items.filter((i) => !i.read_at).length;

  if (items.length === 0) {
    return (
      <Card className="py-12 text-center">
        <BellOff className="mx-auto mb-3 h-10 w-10 text-[hsl(var(--muted))]" />
        <p className="font-semibold">You're all caught up</p>
        <p className="text-sm text-[hsl(var(--muted))]">No notifications yet.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[hsl(var(--muted))]">
          {unread} unread of {items.length}
        </p>
        {unread > 0 && (
          <Button variant="secondary" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {items.map((n) => {
          const meta = KIND_META[n.kind] ?? KIND_META.system;
          const Icon = meta.icon;
          return (
            <Card
              key={n.id}
              className={`flex gap-3 p-4 ${n.read_at ? 'opacity-70' : ''}`}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: meta.color + '22', color: meta.color }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{n.title}</p>
                  {!n.read_at && <Badge color={meta.color}>New</Badge>}
                </div>
                {n.body && <p className="mt-0.5 text-sm text-[hsl(var(--muted))]">{n.body}</p>}
                <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">{formatDateTime(n.created_at)}</p>
              </div>
              <div className="flex gap-1">
                {!n.read_at && (
                  <Button variant="ghost" size="icon" onClick={() => markRead(n.id)} title="Mark read">
                    <CheckCheck className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => remove(n.id)} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
