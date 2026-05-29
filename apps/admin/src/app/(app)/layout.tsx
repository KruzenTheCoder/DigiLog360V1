import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  let siteName: string | null = null;
  if (profile.site_id) {
    const supabase = await createClient();
    const { data } = await supabase.from('sites').select('name').eq('id', profile.site_id).single();
    siteName = data?.name ?? null;
  }

  return (
    <AppShell profile={profile} siteName={profile.role === 'admin' ? null : siteName}>
      {children}
    </AppShell>
  );
}
