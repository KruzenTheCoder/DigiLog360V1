import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type AppRole =
  | 'super_user'
  | 'admin'
  | 'manager'
  | 'control_room'
  | 'supervisor'
  | 'guard';

export const ALL_ROLES: AppRole[] = [
  'super_user', 'admin', 'manager', 'control_room', 'supervisor', 'guard',
];

export interface CallerProfile {
  id: string;
  role: AppRole;
  site_id: string | null;
  org_id: string | null;
  full_name: string | null;
  email: string | null;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Resolve the caller from the Authorization bearer token and return their profile. */
export async function requireUser(req: Request, admin: SupabaseClient): Promise<
  { user: { id: string; email?: string | null }; profile: CallerProfile | null; error?: undefined }
  | { error: string; user?: undefined; profile?: undefined }
> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Missing authorization token' };

  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return { error: 'Invalid or expired session' };

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, site_id, org_id, full_name, email')
    .eq('id', userData.user.id)
    .single();

  return { user: userData.user, profile: (profile as CallerProfile) ?? null };
}

export function requireRole(profile: { role?: AppRole } | null, roles: AppRole[]) {
  return !!profile?.role && roles.includes(profile.role);
}

export function isSuperUser(profile: { role?: AppRole } | null) {
  return profile?.role === 'super_user';
}

/** Enforce that the caller is acting on their own org, unless they're a super_user. */
export function assertSameOrgOrSuper(
  caller: CallerProfile | null,
  targetOrgId: string | null | undefined,
): string | null {
  if (!caller) return 'Caller has no profile';
  if (caller.role === 'super_user') return null;
  if (!caller.org_id) return 'Caller has no organization';
  if (targetOrgId && targetOrgId !== caller.org_id) return 'Cross-org operation not allowed';
  return null;
}
