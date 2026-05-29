import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { initials, formatDateTime } from '@/lib/utils';
import { ROLE_LABELS, type Profile, type Patrol } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: team }, { data: activePatrols }] = await Promise.all([
    supabase.from('profiles').select('*, sites(name)').in('role', ['guard', 'supervisor']).order('full_name'),
    supabase.from('patrols').select('*').eq('status', 'active'),
  ]);

  const members = (team ?? []) as (Profile & { sites: { name: string } | null })[];
  const patrols = (activePatrols ?? []) as Patrol[];
  const onPatrol = new Map(patrols.map((p) => [p.guard_id, p]));

  return (
    <>
      <PageHeader title="Team Status" description="Field staff availability and active patrols." />

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
