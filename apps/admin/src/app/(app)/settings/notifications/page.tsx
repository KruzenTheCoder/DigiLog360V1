import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { NotificationPrefsForm } from '@/components/settings/notification-prefs-form';

export const dynamic = 'force-dynamic';

export default async function NotificationPrefsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, email_notifications, push_notifications, notify_on_assignment, notify_on_sla_breach')
    .eq('id', profile.id).single();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notification preferences"
        description="Choose how DigiLog reaches you for the things that matter."
      />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <NotificationPrefsForm initial={(data ?? {}) as any} />
    </div>
  );
}
