import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  WEB_ROLES, profileRoles, hasAnyRole, hasRole,
  type Profile, type AppRole, type CapabilityKey,
} from '@digilog/shared';

/** Returns the signed-in user's profile, or redirects to /login. */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');
  if (!profile.is_active) redirect('/login?error=deactivated');

  const myRoles = profileRoles(profile as unknown as { role?: AppRole; roles?: AppRole[] });
  const allowed = myRoles.some((r) => WEB_ROLES.includes(r));
  if (!allowed) redirect('/login?error=no_web_access');

  return profile as unknown as Profile;
}

/**
 * Load the current user's capability set. Returns a Set<string> of capability
 * keys they hold, or a single-element set `{'*'}` for super_user (who has all).
 * Cached for the duration of the server request (each Next request creates a
 * fresh supabase client, so this is per-render not per-process).
 */
export async function loadMyCapabilities(): Promise<Set<string>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Set();

  // Read the profile so we can short-circuit super_user.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, roles')
    .eq('id', user.id)
    .single();
  const myRoles = profileRoles(profile as { role?: AppRole; roles?: AppRole[] } | null);
  if (myRoles.includes('super_user')) return new Set(['*']);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('my_capabilities').select('key');
  const set = new Set<string>();
  for (const r of (data ?? []) as { key: string }[]) set.add(r.key);
  return set;
}

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
