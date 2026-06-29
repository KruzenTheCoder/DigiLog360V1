'use client';

/**
 * Drop-in "make this page live" component.
 *
 * Subscribes to Postgres change events for the given tables and, on any
 * insert/update/delete, silently re-runs the current server component via
 * `router.refresh()`. Because the page re-renders on the server, RLS and the
 * page's existing filters/pagination are respected automatically — no need to
 * re-implement them client-side.
 *
 * Design notes:
 *  - Refreshes are DEBOUNCED so a burst of changes (e.g. a bulk update) costs
 *    one refresh, not twenty.
 *  - When the tab is hidden we don't refresh — we just mark the page dirty and
 *    refresh once when it becomes visible again. Keeps idle background tabs
 *    from hammering the server.
 *  - The tables only need to be in the `supabase_realtime` publication (the
 *    core operational tables already are).
 *
 * Usage (from a server component):
 *   <RealtimeRefresh tables={['occurrences', 'occurrence_updates']} />
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function RealtimeRefresh({
  tables,
  schema = 'public',
  debounceMs = 400,
}: {
  tables: string[];
  schema?: string;
  debounceMs?: number;
}) {
  const router = useRouter();
  // Stable key so the effect only re-subscribes when the table set truly
  // changes, not on every parent re-render (array identity changes each time).
  const tablesKey = [...tables].sort().join(',');

  // `dirty` tracks whether a change arrived while the tab was hidden.
  const dirty = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const list = tablesKey ? tablesKey.split(',') : [];
    if (list.length === 0) return;

    const supabase = createClient();

    const runRefresh = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        dirty.current = true;
        return;
      }
      router.refresh();
    };

    const scheduleRefresh = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(runRefresh, debounceMs);
    };

    const channel = supabase.channel(`realtime-refresh:${tablesKey}`);
    for (const table of list) {
      channel.on(
        'postgres_changes',
        { event: '*', schema, table },
        scheduleRefresh,
      );
    }
    channel.subscribe();

    // Flush a pending change as soon as the tab is focused again.
    const onVisible = () => {
      if (!document.hidden && dirty.current) {
        dirty.current = false;
        router.refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [tablesKey, schema, debounceMs, router]);

  return null;
}
