import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { WebhooksManager } from '@/components/settings/webhooks-manager';

export const dynamic = 'force-dynamic';

interface WebhookRow {
  id: string; name: string; url: string; events: string[];
  is_active: boolean; last_status: number | null;
  last_delivered_at: string | null; created_at: string;
}

export default async function WebhooksPage() {
  const profile = await requireProfile();
  if (!isAdmin(profile)) redirect('/dashboard');
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('org_webhooks').select('*').order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Webhooks" description="Fan out events to your monitoring or ticketing system." />
      <WebhooksManager initial={(data ?? []) as WebhookRow[]} />
    </div>
  );
}
