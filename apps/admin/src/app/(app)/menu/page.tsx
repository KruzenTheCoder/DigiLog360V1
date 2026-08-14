import { requireProfile, loadMyCapabilities } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { activeOrgId } from '@/lib/active-org';
import { siteScope } from '@/lib/site-scope';
import { visibleSections } from '@/components/layout/nav-config';
import { RoleMenu, type RoleMenuData } from '@/components/menu/role-menu';
import { profileRoles, roleRank, type AppRole } from '@digilog/shared';

export const dynamic = 'force-dynamic';

// The landing hub each user sees after sign-in: a role-titled banner, a KPI
// strip, and the action cards they're permitted to open. The card list comes
// straight from visibleSections(), so it honours the super-user permissions
// matrix without any extra wiring.
const ROLE_MENU_TITLE: Record<string, string> = {
  super_user: 'Super Admin Console',
  admin: 'Admin Console',
  manager: 'Manager Dashboard',
  control_room: 'Control Room Menu',
  supervisor: 'Supervisor Menu',
  guard: 'Guard Menu',
};

export default async function MenuPage() {
  // Only the (already-cached) profile + capabilities are needed to build the
  // menu — zero extra DB round-trips. The KPI strip + site info are fetched
  // client-side so the cards paint instantly instead of waiting on 5 counts.
  const profile = await requireProfile();
  const caps = await loadMyCapabilities();

  // The launcher must honour the same per-tenant feature gates as the sidebar,
  // or a hidden feature would simply reappear as a card here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = await createClient();
  const { data: featureRows } = await sb
    .from('org_feature_roles')
    .select('feature_key, roles')
    .eq('org_id', await activeOrgId(profile));
  const featureRoles = Object.fromEntries(
    ((featureRows ?? []) as Array<{ feature_key: string; roles: string[] | null }>)
      .map((r) => [r.feature_key, r.roles ?? []]),
  );

  // One menu per role the user holds, so multi-role users (e.g. Control Room +
  // Manager) get a pill switcher. The role filter differentiates the tabs;
  // shared items only appear under the highest-ranked role — see dedupe below.
  const roleList: AppRole[] = profileRoles(profile).length > 0 ? profileRoles(profile) : [profile.role];

  // Sort roles by rank, highest first, so we walk top-down when deduping.
  const rankedRoles = [...roleList].sort((a, b) => roleRank(b) - roleRank(a));

  // For each role, only show items NOT already shown by a higher-ranked role
  // in this same user's set. Identity = href (every nav item has a unique URL).
  // We always KEEP the role's tab even when every item was absorbed by a
  // higher role — the pill stays clickable; the body shows an empty-state
  // message pointing at the higher tab. (The user explicitly wants both tabs
  // visible for dual roles; only the functions are deduped.)
  const seenHrefs = new Set<string>();
  const roleMenus: RoleMenuData[] = [];
  for (const role of rankedRoles) {
    const sections = visibleSections([role], caps, featureRoles)
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => {
          if (seenHrefs.has(i.href)) return false;
          seenHrefs.add(i.href);
          return true;
        }),
      }))
      .filter((s) => s.items.length > 0);
    roleMenus.push({
      role,
      title: ROLE_MENU_TITLE[role] ?? 'Menu',
      sections,
    });
  }

  // Shared scope rules — checks ALL held roles (roles[]), not just the
  // primary, and unions site_ids[] with the legacy site_id column.
  const { ownSites, isUnscoped: isUnscopedRole } = siteScope(profile);

  return (
    <RoleMenu
      roleMenus={roleMenus}
      userId={profile.id}
      orgId={profile.org_id}
      siteIds={ownSites}
      isUnscoped={isUnscopedRole}
    />
  );
}
