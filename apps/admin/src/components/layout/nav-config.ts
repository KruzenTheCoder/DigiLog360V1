import type { AppRole, CapabilityKey } from '@digilog/shared';

export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
  roles?: AppRole[];          // visible to these roles (undefined = all web roles)
  capability?: CapabilityKey | string;  // optional capability gate (and-ed with roles)
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

// Convenience role groups.
const ORG_ADMINS: AppRole[] = ['admin', 'super_user'];
const REVIEWERS: AppRole[] = ['admin', 'super_user', 'manager', 'control_room', 'supervisor'];

export const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
      { label: 'Live Occurrences', href: '/occurrences', icon: 'Radio' },
      { label: 'Notifications', href: '/notifications', icon: 'Bell' },
    ],
  },
  {
    title: 'Occurrences',
    items: [
      { label: 'All Occurrences', href: '/occurrences/all', icon: 'ClipboardList', capability: 'occurrences.view_all' },
      { label: 'Log New Occurrence', href: '/occurrences/new', icon: 'PlusCircle', capability: 'occurrences.log' },
      { label: 'Reports', href: '/reports', icon: 'FileText', roles: REVIEWERS, capability: 'reports.view' },
      { label: 'History', href: '/occurrences/history', icon: 'Archive', capability: 'occurrences.view_all' },
      { label: 'Assigned to Me', href: '/my-queue', icon: 'Inbox', roles: REVIEWERS, capability: 'occurrences.view_assigned' },
      { label: 'Tasks', href: '/tasks', icon: 'CheckCircle' },
    ],
  },
  {
    title: 'Field Operations',
    items: [
      { label: 'Patrols', href: '/patrols', icon: 'Footprints', capability: 'patrols.view' },
      { label: 'Checkpoints', href: '/checkpoints', icon: 'MapPin', roles: REVIEWERS, capability: 'checkpoints.manage' },
      { label: 'Team Status', href: '/team', icon: 'Users', roles: REVIEWERS, capability: 'team.view' },
      { label: 'Visitor Log', href: '/visitors', icon: 'LogIn', capability: 'visitors.manage' },
      { label: 'Key Register', href: '/keys', icon: 'KeyRound', capability: 'keys.manage' },
      { label: 'Shifts', href: '/shifts', icon: 'Clock', roles: REVIEWERS, capability: 'shifts.view_all' },
      { label: 'Patrol Schedules', href: '/patrols/schedules', icon: 'CalendarClock', roles: REVIEWERS, capability: 'patrols.schedule_manage' },
      { label: 'Guard Map', href: '/guards-map', icon: 'Map', roles: REVIEWERS, capability: 'guards.map_view' },
    ],
  },
  {
    title: 'Manager',
    items: [
      { label: 'Acknowledgements', href: '/manager/acknowledgements', icon: 'CheckSquare', roles: ['manager', 'admin', 'super_user'], capability: 'manager.acknowledge' },
      { label: 'Reviewed Logs', href: '/manager/reviewed', icon: 'History', roles: ['manager', 'admin', 'super_user'], capability: 'manager.reviewed_logs' },
      { label: 'Performance Dashboard', href: '/manager/staff-reports', icon: 'BarChart3', roles: ['manager', 'admin', 'super_user'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Users', href: '/users', icon: 'UserCog', roles: ORG_ADMINS, capability: 'users.view' },
      { label: 'Sites', href: '/sites', icon: 'Building2', roles: ORG_ADMINS, capability: 'sites.manage' },
      { label: 'Organisation', href: '/settings/organization', icon: 'Settings', roles: ORG_ADMINS, capability: 'org.edit_branding' },
      { label: 'SLA Matrix', href: '/settings/sla', icon: 'Gauge', roles: ORG_ADMINS, capability: 'org.edit_sla' },
      { label: 'Occurrence Types', href: '/settings/types', icon: 'Tags', roles: ORG_ADMINS, capability: 'org.edit_types' },
      // 'My Access' — hidden per request until the capability matrix is finalised.
      // Route still works if hit directly; just not surfaced in nav/menu.
      // { label: 'My Access', href: '/my-access', icon: 'KeySquare' },
      { label: 'My Preferences', href: '/settings/notifications', icon: 'BellRing', capability: 'preferences.manage' },
      { label: 'Security (2FA)', href: '/settings/security', icon: 'ShieldCheck', capability: 'security.manage_2fa' },
      { label: 'Webhooks', href: '/settings/webhooks', icon: 'Webhook', roles: ORG_ADMINS, capability: 'webhooks.manage' },
      { label: 'API Tokens', href: '/settings/api-tokens', icon: 'Key', roles: ORG_ADMINS, capability: 'api_tokens.manage' },
      { label: 'Audit Log', href: '/settings/audit', icon: 'ScrollText', roles: ORG_ADMINS, capability: 'audit.view' },
    ],
  },
  {
    title: 'Super User',
    items: [
      { label: 'Organisations', href: '/super/organizations', icon: 'Building', roles: ['super_user'], capability: 'super.orgs_manage' },
      { label: 'All Users', href: '/super/users', icon: 'Users2', roles: ['super_user'], capability: 'super.users_cross_org' },
      { label: 'Platform Health', href: '/super/health', icon: 'Activity', roles: ['super_user'], capability: 'super.platform_health' },
      { label: 'Permissions', href: '/super/permissions', icon: 'SlidersHorizontal', roles: ['super_user'], capability: 'super.permissions_manage' },
      { label: 'Branding', href: '/super/branding', icon: 'Palette', roles: ['super_user'] },
    ],
  },
];

/**
 * Pick the sections the user is allowed to see.
 *
 * Filtering rules (an item must pass BOTH):
 *  • `roles`       — if set, the user must hold at least one of these roles.
 *  • `capability`  — if set AND `caps` was provided, the user must have it.
 *
 * `caps` of `null`/`undefined` means "capability gating not loaded" — we
 * fall back to roles-only filtering (still secure; just less granular).
 * A `caps` set containing `'*'` means super_user (everything is allowed).
 */
export function visibleSections(
  rolesOrRole: AppRole | AppRole[],
  caps?: Set<string> | null,
): NavSection[] {
  const roles = Array.isArray(rolesOrRole) ? rolesOrRole : [rolesOrRole];
  const isSuper = !!caps && caps.has('*');
  return NAV
    .map((section) => ({
      ...section,
      items: section.items.filter((i) => {
        if (i.roles && !i.roles.some((r) => roles.includes(r))) return false;
        if (caps && i.capability && !isSuper && !caps.has(i.capability)) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);
}
