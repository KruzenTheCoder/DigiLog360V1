import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { UsersManager } from '@/components/users/users-manager';
import type { Site, Profile, Organization } from '@digilog/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AllUsersPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [{ data: users }, { data: sites }, { data: orgs }] = await Promise.all([
    supabase.from('profiles')
      .select('*, sites(name)')
      .order('created_at', { ascending: false }),
    supabase.from('sites').select('*').order('name'),
    sb.from('organizations').select('*').order('name'),
  ]);

  const orgList = (orgs ?? []) as unknown as Organization[];
  const orgNameById = new Map(orgList.map((o) => [o.id, o.name]));
  const usersWithOrg = ((users ?? []) as unknown as Profile[]).map((u) => ({
    ...u, org_name: u.org_id ? orgNameById.get(u.org_id) ?? '—' : '—',
  }));

  // Counts by org for the strip.
  const byOrg = new Map<string, number>();
  usersWithOrg.forEach((u) => {
    if (!u.org_id) return;
    byOrg.set(u.org_id, (byOrg.get(u.org_id) ?? 0) + 1);
  });

  return (
    <>
      <PageHeader
        title="All Users (cross-org)"
        description="Every user across every organisation. Use this view sparingly."
      />

      <Card className="mb-5">
        <CardHeader><CardTitle>Users per organisation</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {orgList.map((o) => (
              <div key={o.id} className="rounded-lg border px-3 py-2 text-sm">
                <span className="font-medium">{o.name}</span>
                <span className="ml-2 text-[hsl(var(--muted))]">{byOrg.get(o.id) ?? 0} users</span>
              </div>
            ))}
            {orgList.length === 0 && (
              <p className="text-sm text-[hsl(var(--muted))]">No organisations.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <UsersManager
        users={usersWithOrg as any}
        sites={(sites ?? []) as Site[]}
        callerRoles={Array.isArray(profile.roles) && profile.roles.length > 0 ? profile.roles : [profile.role]}
        callerOrgId={null}
      />
    </>
  );
}
