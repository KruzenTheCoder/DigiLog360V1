import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { TaskDetail } from '@/components/tasks/task-detail';
import type { Task, TaskUpdate } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function TaskDetailPage({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  // Task + its update history both key off the id and don't depend on each
  // other — fetch in parallel, then guard on the task.
  const [{ data: task }, { data: updates }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('tasks').select('*').eq('id', Number(id)).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('task_updates')
      .select('*').eq('task_id', Number(id)).order('created_at', { ascending: false }),
  ]);
  if (!task) notFound();

  return (
    <>
      <PageHeader
        title={(task as Task).title}
        description={
          (task as Task).ob_number
            ? `Linked to ${(task as Task).ob_number}`
            : 'Standalone task'
        }
      />
      <TaskDetail
        task={task as Task}
        updates={(updates ?? []) as TaskUpdate[]}
        currentUserId={profile.id}
        currentUserName={profile.full_name ?? profile.email ?? 'Unknown'}
      />
    </>
  );
}
