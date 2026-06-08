import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { NotificationsList } from '@/components/notifications/notifications-list';

export const dynamic = 'force-dynamic';

interface NotificationRow {
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

export default async function NotificationsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('notifications')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <>
      <PageHeader title="Notifications" description="SLA alerts, manager acknowledgements, and system messages." />
      <NotificationsList initial={(data ?? []) as NotificationRow[]} />
    </>
  );
}
