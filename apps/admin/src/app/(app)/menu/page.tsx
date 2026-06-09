import { createClient } from '@/lib/supabase/server';
import { requireProfile, loadMyCapabilities } from '@/lib/auth';
import { visibleSections } from '@/components/layout/nav-config';
import { RoleMenu, type RoleMenuData } from '@/components/menu/role-menu';
import { profileRoles, type AppRole } from '@digilog/shared';

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
  const profile = await requireProfile();
  const caps = await loadMyCapabilities();
  const supabase = await createClient();

  // One menu per role the user holds, so multi-role users (e.g. Control Room +
  // Manager) get a pill switcher. The role filter differentiates the tabs;
  // common items appear under each. Fall back to the combined view if a single
  // role resolves to nothing.
  const roleList: AppRole[] = profileRoles(profile).length > 0 ? profileRoles(profile) : [profile.role];
  const roleMenus: RoleMenuData[] = roleList
    .map((role) => ({
      role,
      title: ROLE_MENU_TITLE[role] ?? 'Menu',
      sections: visibleSections([role], caps),
    }))
    .filter((m) => m.sections.length > 0);
  if (roleMenus.length === 0) {
    roleMenus.push({
      role: roleList[0],
      title: ROLE_MENU_TITLE[roleList[0]] ?? 'Menu',
      sections: visibleSections(roleList, caps),
    });
  }

  let siteName: string | null = null;
  if (profile.site_id && profile.role !== 'admin' && profile.role !== 'super_user') {
    const { data } = await supabase.from('sites').select('name').eq('id', profile.site_id).maybeSingle();
    siteName = data?.name ?? null;
  }

  // KPI strip — RLS scopes these counts to the caller's organisation.
  const base = () => supabase.from('occurrences').select('id', { count: 'exact', head: true });
  const [{ count: total }, { count: open }, { count: closed }, { count: critical }] = await Promise.all([
    base(),
    base().not('status', 'in', '(resolved,closed)'),
    base().in('status', ['resolved', 'closed']),
    base().eq('severity', 'critical').not('status', 'in', '(resolved,closed)'),
  ]);

  const kpis = [
    { label: 'Total Occurrences', value: total ?? 0, accent: 'bg-brand' },
    { label: 'Open / Live', value: open ?? 0, accent: 'bg-amber-400' },
    { label: 'Closed / Resolved', value: closed ?? 0, accent: 'bg-emerald-400' },
    { label: 'Critical', value: critical ?? 0, accent: 'bg-red-500' },
  ];

  return <RoleMenu roleMenus={roleMenus} kpis={kpis} siteName={siteName} />;
}
