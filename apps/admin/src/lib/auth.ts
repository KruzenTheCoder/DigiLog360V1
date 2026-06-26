import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  WEB_ROLES, profileRoles, hasAnyRole, hasRole,
  type Profile, type AppRole, type CapabilityKey,
} from '@digilog/shared';

/**
 * Per-request caches.
 *
 * `React.cache` memoises the result by reference for the duration of a single
 * server render — every page calling these helpers (e.g. (app)/layout AND the
 * route's own page.tsx) reuses the same auth + profile + caps fetches instead
 * of repeating them. Worth ~5 sequential Supabase round-trips per page on
 * routes that gate behind capabilities.
 */

/** Cached signed-in user (one network round-trip to Supabase Auth per render). */
const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

/** Cached profile fetch — selects only the columns the AppShell + auth helpers use. */
const getCachedProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  return (data ?? null) as Profile | null;
});

/**
 * Returns the signed-in user's profile, or redirects to /login.
 *
 * Every failure mode redirects with an explicit `?error=` param. The middleware
 * uses the presence of any query param on /login to suppress the
 * "you're signed in, go back to /menu" auto-redirect — without that, a user
 * with no profile / no web role / inactive account would loop forever between
 * the layout (kicks them out) and the middleware (sends them back).
 */
export const requireProfile = cache(async (): Promise<Profile> => {
  const profile = await getCachedProfile();
  if (!profile) redirect('/login?error=no_profile');
  if (!profile.is_active) redirect('/login?error=deactivated');

  const myRoles = profileRoles(profile as unknown as { role?: AppRole; roles?: AppRole[] });
  const allowed = myRoles.some((r) => WEB_ROLES.includes(r));
  if (!allowed) redirect('/login?error=no_web_access');
  return profile;
});

/**
 * Capability set for the current user. Returns a Set<string> of capability
 * keys, or a single-element set `{'*'}` for super_user (who has all).
 * Cached per-render so multiple calls share one fetch.
 */
export const loadMyCapabilities = cache(async (): Promise<Set<string>> => {
  const profile = await getCachedProfile();
  if (!profile) return new Set();

  const myRoles = profileRoles(profile as { role?: AppRole; roles?: AppRole[] | null });
  if (myRoles.includes('super_user')) return new Set(['*']);

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('my_capabilities').select('key');
  const set = new Set<string>();
  for (const r of (data ?? []) as { key: string }[]) set.add(r.key);
  return set;
});

/** Convenience: typed capability check. */
export function can(caps: Set<string>, key: CapabilityKey | string): boolean {
  return caps.has('*') || caps.has(key);
}

/** Enforce that the caller has at least one of the supplied roles. */
export async function requireRole(roles: AppRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!hasAnyRole(profile, roles)) redirect('/dashboard');
  return profile;
}

/** Enforce that the caller has the given capability. */
export async function requireCapability(key: CapabilityKey | string): Promise<{ profile: Profile; caps: Set<string> }> {
  const profile = await requireProfile();
  const caps = await loadMyCapabilities();
  if (!can(caps, key)) redirect('/dashboard');
  return { profile, caps };
}

export function isSuperUser(profile: Profile) {
  return hasRole(profile, 'super_user');
}

export function isAdmin(profile: Profile) {
  return hasAnyRole(profile, ['admin', 'super_user']);
}

export function isManager(profile: Profile) {
  return hasAnyRole(profile, ['manager', 'admin', 'super_user']);
}

export function canManageSite(profile: Profile) {
  return hasAnyRole(profile, ['admin', 'super_user', 'manager', 'control_room', 'supervisor']);
}
