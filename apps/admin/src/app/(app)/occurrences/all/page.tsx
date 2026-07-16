import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { siteScope } from '@/lib/site-scope';
import { PageHeader } from '@/components/page-header';
import { OccurrencesExplorer } from '@/components/occurrences/occurrences-explorer';
import { RealtimeRefresh } from '@/components/realtime/realtime-refresh';
import {
  parseOccurrencesFilter, clampPage, clampPageSize, type Occurrence, type SavedView,
} from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AllOccurrencesPage({ searchParams }: PageProps) {
  const profile = await requireProfile();
  const params = await searchParams;

  const filter = parseOccurrencesFilter(params);
  const page = clampPage(typeof params.page === 'string' ? params.page : '1');
  const pageSize = clampPageSize(typeof params.pageSize === 'string' ? params.pageSize : undefined);
  const sort = (typeof params.sort === 'string' ? params.sort : 'incident_at') || 'incident_at';
  const dir = (typeof params.dir === 'string' ? params.dir : 'desc') === 'asc' ? 'asc' : 'desc';

  const supabase = await createClient();

  // Site scope — admin / super_user (any held role) see every site; everyone
  // else is restricted to the sites they're assigned to (profile.site_ids[]
  // union legacy site_id column).
  const { ownSites, isUnscoped } = siteScope(profile);

  // ---------- build the query ----------
  const fetchAllOccurrences = async () => {
    const base = () => {
      let b = supabase
        .from('occurrences')
        .select('*', { count: 'exact' })
        .order(sort, { ascending: dir === 'asc' });

      if (filter.q) {
        // Fuzzy match across ob_number / type / description (gin_trgm indices).
        const needle = filter.q.replace(/[%_]/g, '\\$&');
        b = b.or(
          [
            `ob_number.ilike.%${needle}%`,
            `occurrence_type.ilike.%${needle}%`,
            `description.ilike.%${needle}%`,
            `logged_by_name.ilike.%${needle}%`,
          ].join(','),
        );
      }
      if (filter.status) b = b.eq('status', filter.status);
      if (filter.status_group === 'live') b = b.not('status', 'in', '(resolved,closed)');
      if (filter.status_group === 'done') b = b.in('status', ['resolved', 'closed']);
      if (filter.severity) b = b.eq('severity', filter.severity);
      if (filter.site_id) b = b.eq('site_id', filter.site_id);
      if (filter.site_name) b = b.eq('site_name', filter.site_name);
      if (filter.type) b = b.eq('occurrence_type', filter.type);
      if (filter.logged_by) b = b.eq('logged_by', filter.logged_by);
      if (filter.is_patrol === 'true') b = b.eq('is_patrol', true);
      if (filter.is_patrol === 'false') b = b.eq('is_patrol', false);
      if (filter.from) b = b.gte('incident_at', new Date(filter.from).toISOString());
      if (filter.to) {
        const end = new Date(filter.to);
        end.setUTCHours(23, 59, 59, 999);
        b = b.lte('incident_at', end.toISOString());
      }
      return b;
    };

    const offset = (page - 1) * pageSize;
    if (!isUnscoped) {
      // Site-less scoped user → own rows only (unfiltered would time out).
      const q = ownSites.length > 0
        ? base().in('site_id', ownSites)
        : base().eq('logged_by', profile.id);
      return await q.range(offset, offset + pageSize - 1);
    }

    return await base().range(offset, offset + pageSize - 1);
  };

  // ---------- saved views (graceful if migration not deployed yet) ----------
  // Wrapped so a missing table resolves to [] instead of rejecting the batch.
  const savedViewsQuery = (async (): Promise<unknown[]> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (supabase as any)
        .from('saved_views')
        .select('*')
        .eq('scope', 'occurrences')
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      return res.error ? [] : (res.data ?? []);
    } catch {
      return [];
    }
  })();

  // These reads are independent of one another — run them as a single parallel
  // batch instead of a serial waterfall. From SA→US that turns ~5 sequential
  // round-trips (~1s+) into one.
  const [
    { data, count },
    { data: sites },
    { data: assignables },
    { data: typeRows },
    views,
  ] = await Promise.all([
    fetchAllOccurrences(),
    supabase.from('sites').select('id, name').order('name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('profiles').select('id, full_name, email, role')
      .in('role', ['admin', 'manager', 'control_room', 'supervisor'])
      .order('full_name'),
    // PostgREST has no DISTINCT — sample a window and unique client-side.
    // Scoped the same way as the main list: an unfiltered sample forces a
    // full-table RLS scan for non-admins, which times out.
    (() => {
      let tq = supabase.from('occurrences').select('occurrence_type').limit(2000);
      if (!isUnscoped) {
        tq = ownSites.length > 0 ? tq.in('site_id', ownSites) : tq.eq('logged_by', profile.id);
      }
      return tq;
    })(),
    savedViewsQuery,
  ]);

  const distinctTypes = Array.from(
    new Set((typeRows ?? []).map((t: { occurrence_type: string | null }) => t.occurrence_type).filter(Boolean) as string[]),
  ).sort();

  return (
    <>
      <RealtimeRefresh tables={['occurrences']} />
      <PageHeader
        title="All Occurrences"
        description="Complete occurrence book — search, filter and export."
      />
      <OccurrencesExplorer
        rows={(data ?? []) as Occurrence[]}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        sort={sort}
        dir={dir}
        filter={filter}
        sites={(sites ?? []) as { id: string; name: string }[]}
        types={distinctTypes}
        savedViews={(views ?? []) as unknown as SavedView[]}
        currentUserId={profile.id}
        currentUserName={profile.full_name ?? profile.email ?? 'Unknown'}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assignables={(assignables ?? []) as any}
      />
    </>
  );
}
