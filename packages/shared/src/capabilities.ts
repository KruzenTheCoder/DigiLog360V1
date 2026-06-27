// ============================================================================
// DigiLog 360 — Capability registry (client-side mirror).
// Source of truth is the database (public.capabilities). This file just gives
// the apps typed string constants + helpers so we don't typo capability keys.
// ============================================================================

/** All built-in capability keys, mirroring the seed in migration 14. */
export const CAPABILITY_KEYS = [
  // Dashboard
  'dashboard.view',
  'dashboard.cross_org',
  // Occurrences
  'occurrences.view_all',
  'occurrences.view_assigned',
  'occurrences.log',
  'occurrences.update_status',
  'occurrences.assign',
  'occurrences.delete',
  'occurrences.bulk_actions',
  'occurrences.comment',
  'occurrences.export_csv',
  'occurrences.log_management_report',
  // Reports
  'reports.view',
  'reports.create',
  'reports.export_pdf',
  // Manager
  'manager.acknowledge',
  'manager.escalate',
  'manager.reviewed_logs',
  // Patrols
  'patrols.view',
  'patrols.run',
  'patrols.scan',
  'patrols.end_remote',
  'patrols.schedule_manage',
  'checkpoints.manage',
  // Field ops
  'team.view',
  'visitors.manage',
  'keys.manage',
  'shifts.view_all',
  'shifts.clock',
  'guards.map_view',
  // Users
  'users.view',
  'users.create',
  'users.edit',
  'users.deactivate',
  'users.reset_pin',
  // Sites
  'sites.manage',
  // Org settings
  'org.edit_branding',
  'org.edit_sla',
  'org.edit_types',
  'webhooks.manage',
  'api_tokens.manage',
  'audit.view',
  // Personal
  'notifications.view_own',
  'preferences.manage',
  'security.manage_2fa',
  // Mobile UI preferences (legacy aliases — kept for older builds)
  'mobile.kpi_visible',
  'mobile.occurrence_history_visible',
  // Mobile home containers — each gates a portal card on the guard home.
  'mobile.home.new_occurrence',
  'mobile.home.shift',
  'mobile.home.duty',
  'mobile.home.patrol',
  'mobile.home.scan',
  'mobile.home.visitors',
  'mobile.home.keys',
  'mobile.home.tasks',
  'mobile.home.history',
  'mobile.home.kpi',
  'mobile.home.supervisor_board',
  'mobile.home.team',
  // Mobile bottom tab bar — master switch + per-tab visibility.
  'mobile.tab_bar',
  'mobile.tab.home',
  'mobile.tab.patrol',
  'mobile.tab.log',
  'mobile.tab.logs',
  // Super user
  'super.orgs_manage',
  'super.users_cross_org',
  'super.platform_health',
  'super.permissions_manage',
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

/**
 * Check whether a user's resolved capability set contains a key.
 * The caller is expected to have already loaded the set via
 * `select key from public.my_capabilities`.
 *
 * Pass `null` for `userCaps` to mean "loading" (returns false).
 * Pass `'*'` in the set to mean "super-user has everything".
 */
export function hasCapability(
  userCaps: Set<string> | null | undefined,
  key: CapabilityKey | string,
): boolean {
  if (!userCaps) return false;
  if (userCaps.has('*')) return true;
  return userCaps.has(key);
}

export function hasAnyCapability(
  userCaps: Set<string> | null | undefined,
  keys: (CapabilityKey | string)[],
): boolean {
  if (!userCaps) return false;
  if (userCaps.has('*')) return true;
  return keys.some((k) => userCaps.has(k));
}

export function hasAllCapabilities(
  userCaps: Set<string> | null | undefined,
  keys: (CapabilityKey | string)[],
): boolean {
  if (!userCaps) return false;
  if (userCaps.has('*')) return true;
  return keys.every((k) => userCaps.has(k));
}
