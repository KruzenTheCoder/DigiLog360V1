import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { WelcomePacksManager } from '@/components/super/welcome-packs-manager';

export const dynamic = 'force-dynamic';

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean | null;
  org_id: string | null;
}

export default async function WelcomePacksPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;
  const orgId = (profile as unknown as { org_id: string }).org_id;

  const [usersRes, orgRes, logRes] = await Promise.all([
    sb.from('profiles')
      .select('id, full_name, email, role, is_active, org_id')
      .order('full_name', { ascending: true }),
    sb.from('organizations').select('name').eq('id', orgId).single(),
    // Only the welcome sends — the full ledger lives on the Email Alerts page.
    sb.from('email_log')
      .select('id, recipient_name, recipient_email, subject, status, error, is_test, created_at')
      .eq('event', 'user.welcome')
      .order('id', { ascending: false })
      .limit(50),
  ]);

  return (
    <>
      <PageHeader
        title="Welcome Packs"
        description="Send someone their sign-in details — the link, their username, and either a one-time password or a link to choose their own. Send a preview to yourself first; nothing on an account changes until you send the real thing."
      />
      <WelcomePacksManager
        users={(usersRes.data ?? []) as UserRow[]}
        orgName={(orgRes?.data?.name as string) ?? 'DigiLog 360'}
        appUrl={process.env.PUBLIC_APP_URL ?? null}
        currentUserEmail={(profile as unknown as { email: string | null }).email ?? ''}
        initialLog={logRes.data ?? []}
      />
    </>
  );
}
