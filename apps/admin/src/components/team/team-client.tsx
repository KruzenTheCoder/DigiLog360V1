'use client';

import { createClient } from '@/lib/supabase/client';
import { useCachedQuery } from '@/lib/use-cached-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { initials, formatDateTime } from '@/lib/utils';
import { ROLE_LABELS, type Profile, type Patrol } from '@digilog/shared';

type Member = Profile & { sites: { name: string } | null };
interface TeamData { members: Member[]; patrols: Patrol[] }

/** Client-cached Team Status — read-only, so instant on revisit, no mutation
 *  refresh to worry about. */
export function TeamClient() {
  const { data, loading } = useCachedQuery<TeamData>(
    'team-status',
    async () => {
      const sb = createClient();
      const [{ data: team }, { data: activePatrols }] = await Promise.all([
        sb.from('profiles').select('*, sites(name)').in('role', ['guard', 'supervisor']).order('full_name'),
        sb.from('patrols').select('*').eq('status', 'active'),
      ]);
      return {
        members: (team ?? []) as Member[],
        patrols: (activePatrols ?? []) as Patrol[],
      };
    },
    { staleMs: 10_000 },
  );

  if (loading && !data) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-200/70 dark:bg-slate-800/60" />)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-200/70 dark:bg-slate-800/60" />)}
        </div>
      </div>
    );
  }

  const members = data?.members ?? [];
  const patrols = data?.patrols ?? [];
  const onPatrol = new Map(patrols.map((p) => [p.guard_id, p]));

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Field Staff" value={members.length} icon="Users" tone="brand" />
        <StatCard label="On Patrol" value={patrols.length} icon="Footprints" tone="success" />
        <StatCard label="Available" value={members.filter((m) => m.is_active && !onPatrol.has(m.id)).length} icon="UserCheck" />
        <StatCard label="Inactive" value={members.filter((m) => !m.is_active).length} icon="UserX" tone="default" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => {
          const patrol = onPatrol.get(m.id);
          return (
            <Card key={m.id} className="flex items-center gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gradient font-semibold text-white">
                {initials(m.full_name || m.email)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.full_name ?? m.email}</p>
                <p className="text-xs text-[hsl(var(--muted))]">{ROLE_LABELS[m.role]} · {m.sites?.name ?? 'No site'}</p>
                {patrol && <p className="mt-0.5 text-xs text-teal-600">Since {formatDateTime(patrol.started_at)}</p>}
              </div>
              {!m.is_active ? <Badge color="#64748b">Inactive</Badge>
                : patrol ? <Badge color="#14b8a6">On Patrol</Badge>
                : <Badge color="#16a34a">Available</Badge>}
            </Card>
          );
        })}
        {members.length === 0 && <p className="text-sm text-[hsl(var(--muted))]">No field staff yet.</p>}
      </div>
    </>
  );
}
