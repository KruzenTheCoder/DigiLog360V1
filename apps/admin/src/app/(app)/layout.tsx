import { requireProfile, loadMyCapabilities } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // requireProfile must resolve first because we need site_id; but capabilities
  // and the (optional) site-name lookup can run in parallel with each other —
  // and the capability call shares the cached profile fetch with requireProfile.
  const profile = await requireProfile();

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;
  const [capsSet, siteRow, orgRow] = await Promise.all([
    loadMyCapabilities(),
    profile.site_id
      ? supabase.from('sites').select('name').eq('id', profile.site_id).single()
      : Promise.resolve({ data: null }),
    sb.from('organizations').select('show_netstream_logo').eq('id', profile.org_id).maybeSingle(),
  ]);

  return (
    <AppShell
      profile={profile}
      siteName={profile.role === 'admin' ? null : (siteRow.data?.name ?? null)}
      capabilities={Array.from(capsSet)}
      showNetstreamLogo={orgRow.data?.show_netstream_logo !== false}
    >
      {children}
    </AppShell>
  );
}
