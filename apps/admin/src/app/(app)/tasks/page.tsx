import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { activeOrgId } from '@/lib/active-org';
import { PageHeader } from '@/components/page-header';
import { TasksBoard } from '@/components/tasks/tasks-board';
import type { Task, AppRole } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const profile = await requireProfile();
  // Scoped to the tenant the header selects. A super user's RLS spans every
  // organisation, so without this the page answers for the wrong one.
  const orgId = await activeOrgId(profile);
  const params = await searchParams;
  const supabase = await createClient();

  // Default scope: my queue + watched. Switchable via ?scope=mine|all|created.
  const scope = (typeof params.scope === 'string' ? params.scope : 'mine') as 'mine' | 'all' | 'created';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any).from('tasks').select('*').eq('org_id', orgId);
  if (scope === 'mine') q = q.eq('assigned_to', profile.id);
  else if (scope === 'created') q = q.eq('assigned_by', profile.id);
  // else: all — RLS shows the user's org tasks
  q = q.order('status', { ascending: true }).order('due_at', { ascending: true, nullsFirst: false });
  const { data } = await q.limit(500);

  // Assignable users (admin/manager/control_room/supervisor/guard within the org)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assignables } = await (supabase as any)
    .from('profiles').select('id, full_name, email, role, roles').eq('org_id', orgId)
    .order('full_name');

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Assign work, track progress, and close out items with notes."
      />
      <TasksBoard
        initial={(data ?? []) as Task[]}
        scope={scope}
        currentUserId={profile.id}
        currentUserName={profile.full_name ?? profile.email ?? 'Unknown'}
        assignables={(assignables ?? []) as { id: string; full_name: string | null; email: string | null; role: AppRole; roles: AppRole[] }[]}
      />
    </>
  );
}
