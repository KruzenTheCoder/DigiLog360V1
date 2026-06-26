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

  // Union of the user's assigned sites (site_ids[] + legacy site_id).
  const profSiteIds = (profile as unknown as { site_ids?: string[] | null }).site_ids ?? [];
  const ownSiteIds = Array.from(new Set([
    ...(Array.isArray(profSiteIds) ? profSiteIds : []),
    ...(profile.site_id ? [profile.site_id] : []),
  ]));

  const [capsSet, sitesRows, orgRow] = await Promise.all([
    loadMyCapabilities(),
    ownSiteIds.length > 0
      ? supabase.from('sites').select('id, name').in('id', ownSiteIds)
      : Promise.resolve({ data: [] }),
    sb.from('organizations').select('show_netstream_logo, netstream_logo_url').eq('id', profile.org_id).maybeSingle(),
  ]);

  // Header site label:
  //   • admin / super_user → "All sites"
  //   • multiple assigned   → "Multi-site"
  //   • exactly one         → that site's name
  const siteList = (sitesRows.data ?? []) as Array<{ id: string; name: string }>;
  const isUnscoped = profile.role === 'admin' || profile.role === 'super_user';
  const siteLabel = isUnscoped
    ? 'All sites'
    : siteList.length > 1
      ? 'Multi-site'
      : siteList[0]?.name ?? 'All sites';

  return (
    <AppShell
      profile={profile}
      siteName={siteLabel}
      siteCount={isUnscoped ? 0 : siteList.length}
      capabilities={Array.from(capsSet)}
      showNetstreamLogo={orgRow.data?.show_netstream_logo !== false}
      netstreamLogoUrl={orgRow.data?.netstream_logo_url ?? null}
    >
      {children}
    </AppShell>
  );
}
