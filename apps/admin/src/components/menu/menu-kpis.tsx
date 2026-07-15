'use client';

import { createClient } from '@/lib/supabase/client';
import { useCachedQuery } from '@/lib/use-cached-query';

interface Kpis { total: number; open: number; closed: number; critical: number }

/**
 * Menu KPI strip — fetched CLIENT-side so it never blocks the menu render.
 * The menu cards paint instantly from cached capabilities; these four counts
 * stream in a moment later and are cached (instant on every revisit).
 *
 * IMPORTANT: the counts MUST carry the same explicit org/site narrowing the
 * All Occurrences list uses. A count that relies on RLS alone forces Postgres
 * to evaluate the (expensive) site-scoping predicate across the whole
 * occurrences table for non-admin users, which hits the statement timeout and
 * returns a null count — the "everything shows 0 even though there are logs"
 * bug. Filtering by org_id (+ the user's site_ids for scoped roles) lets the
 * indexes do the work, matching what the list already does.
 */
export function MenuKpis({
  userId, orgId, siteIds, isUnscoped,
}: {
  userId: string;
  orgId: string;
  /** The sites this user is assigned to (site_ids ∪ legacy site_id). */
  siteIds: string[];
  /** admin / super_user — see the whole org, no site narrowing. */
  isUnscoped: boolean;
}) {
  const scopeKey = isUnscoped ? 'all' : siteIds.slice().sort().join(',') || 'own';
  const { data, loading } = useCachedQuery<Kpis>(
    `menu-kpis:${userId}:${scopeKey}`,
    async () => {
      const sb = createClient();
      const base = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = (sb as any)
          .from('occurrences')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId);
        if (!isUnscoped) {
          // Scoped roles (control room / supervisor / manager) only see their
          // assigned site(s). Narrow explicitly so the count uses the site
          // index instead of a full-table RLS scan (which times out → 0).
          q = siteIds.length > 0 ? q.in('site_id', siteIds) : q.eq('logged_by', userId);
        }
        return q;
      };
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
