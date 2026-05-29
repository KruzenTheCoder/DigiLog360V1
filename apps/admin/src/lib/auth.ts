import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WEB_ROLES, type Profile } from '@digilog/shared';

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
  if (!WEB_ROLES.includes(profile.role)) redirect('/login?error=no_web_access');

  return profile as Profile;
}

export function isAdmin(profile: Profile) {
  return profile.role === 'admin';
}

export function canManageSite(profile: Profile) {
  return profile.role === 'admin' || profile.role === 'control_room' || profile.role === 'supervisor';
}
