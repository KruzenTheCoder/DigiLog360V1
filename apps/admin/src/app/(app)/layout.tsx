import { requireProfile, loadMyCapabilities } from '@/lib/auth';
import { siteScope } from '@/lib/site-scope';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { activeOrgId } from '@/lib/active-org';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // requireProfile must resolve first because we need site_id; but capabilities
  // and the (optional) site-name lookup can run in parallel with each other —
  // and the capability call shares the cached profile fetch with requireProfile.
  const profile = await requireProfile();

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  // Union of the user's assigned sites (site_ids[] + legacy site_id).
  const { ownSites: ownSiteIds, isUnscoped } = siteScope(profile);

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
  const siteLabel = isUnscoped
    ? 'All sites'
    : siteList.length > 1
      ? 'Multi-site'
      : siteList[0]?.name ?? 'All sites';

  // Tenant picker — super users only. Everyone else is pinned to their own
  // organisation by RLS, so the switcher would be a control with one option.
  const isSuper = profile.role === 'super_user';
  const tenants = isSuper
    ? (((await sb.from('organizations').select('id, name').order('name')).data) ?? []) as Array<{ id: string; name: string }>
    : [];
  const activeOrg = isSuper ? await activeOrgId(profile) : null;

  // Which roles may see each gated feature in THIS tenant. Absent key = not
  // configured, so the item behaves as it always did.
  const scopedOrg = await activeOrgId(profile);
  const { data: featureRows } = await sb
    .from('org_feature_roles')
    .select('feature_key, roles')
    .eq('org_id', scopedOrg);
  const featureRoles = Object.fromEntries(
    ((featureRows ?? []) as Array<{ feature_key: string; roles: string[] | null }>)
      .map((r) => [r.feature_key, r.roles ?? []]),
  );

  return (
    <AppShell
      profile={profile}
      siteName={siteLabel}
      siteCount={isUnscoped ? 0 : siteList.length}
      capabilities={Array.from(capsSet)}
      showNetstreamLogo={orgRow.data?.show_netstream_logo !== false}
      netstreamLogoUrl={orgRow.data?.netstream_logo_url ?? null}
      tenants={tenants}
      activeOrg={activeOrg}
      featureRoles={featureRoles}
    >
      {children}
    </AppShell>
  );
}
