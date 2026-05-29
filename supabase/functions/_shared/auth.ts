import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type AppRole = 'admin' | 'control_room' | 'supervisor' | 'guard';

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Resolve the caller from the Authorization bearer token and return their profile. */
export async function requireUser(req: Request, admin: SupabaseClient) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Missing authorization token' as const };

  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return { error: 'Invalid or expired session' as const };

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, site_id, full_name')
    .eq('id', userData.user.id)
    .single();

  return { user: userData.user, profile };
}

export function requireRole(profile: { role?: AppRole } | null, roles: AppRole[]) {
  return !!profile?.role && roles.includes(profile.role);
}
