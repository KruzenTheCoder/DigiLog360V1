import { cookies } from 'next/headers';

export const ACTIVE_ORG_COOKIE = 'digilog_active_org';

/**
 * Which organisation the current request should be scoped to.
 *
 * Every role except super_user is pinned to their own org by RLS, so this
 * simply returns it. A super_user's RLS policy deliberately spans every
 * tenant — which is what makes cross-org administration possible, and also
 * what makes an unfiltered page show PMI and Netstream people tangled
 * together. For them the active tenant is an explicit choice, held in a
 * cookie and switched from the header.
 *
 * Pages should filter on the returned id rather than relying on RLS alone.
 */
export async function activeOrgId(profile: { role?: string; org_id?: string | null }) {
  const own = profile.org_id ?? null;
  if (profile.role !== 'super_user') return own;

  const chosen = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  return chosen && chosen !== 'all' ? chosen : own;
}

/** True when a super user has explicitly chosen to see every tenant at once. */
export async function isAllTenants(profile: { role?: string }) {
  if (profile.role !== 'super_user') return false;
  return (await cookies()).get(ACTIVE_ORG_COOKIE)?.value === 'all';
}
