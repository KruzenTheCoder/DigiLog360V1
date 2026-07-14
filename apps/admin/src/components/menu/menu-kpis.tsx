'use client';

import { createClient } from '@/lib/supabase/client';
import { useCachedQuery } from '@/lib/use-cached-query';

interface Kpis { total: number; open: number; closed: number; critical: number }

/**
 * Menu KPI strip — fetched CLIENT-side so it never blocks the menu render.
 * The menu cards paint instantly from cached capabilities; these four counts
 * stream in a moment later and are cached (instant on every revisit).
 */
export function MenuKpis({ userId }: { userId: string }) {
  const { data, loading } = useCachedQuery<Kpis>(
    `menu-kpis:${userId}`,
    async () => {
      const sb = createClient();
      const base = () => sb.from('occurrences').select('id', { count: 'exact', head: true });
      const [t, o, c, cr] = await Promise.all([
        base(),
        base().not('status', 'in', '(resolved,closed)'),
        base().in('status', ['resolved', 'closed']),
        base().eq('severity', 'critical').not('status', 'in', '(resolved,closed)'),
      ]);
      return {
        total: t.count ?? 0,
        open: o.count ?? 0,
        closed: c.count ?? 0,
        critical: cr.count ?? 0,
      };
    },
    { staleMs: 30_000 },
  );

  const items = [
    { label: 'Total Occurrences', value: data?.total, accent: 'bg-brand' },
    { label: 'Open / Live', value: data?.open, accent: 'bg-amber-400' },
    { label: 'Closed / Resolved', value: data?.closed, accent: 'bg-emerald-400' },
    { label: 'Critical', value: data?.critical, accent: 'bg-red-500' },
  ];

  return (
    <div className="mb-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="flex items-stretch overflow-hidden rounded-xl border bg-[hsl(var(--surface))] shadow-sm">
          <span className={`w-1.5 shrink-0 ${k.accent}`} />
          <div className="px-4 py-3">
            {loading && k.value === undefined ? (
              <div className="h-7 w-12 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
            ) : (
              <p className="text-2xl font-extrabold leading-tight">{k.value ?? 0}</p>
            )}
            <p className="text-xs text-[hsl(var(--muted))]">{k.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
