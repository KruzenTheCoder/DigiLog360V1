import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { UsersManager } from '@/components/users/users-manager';
import type { Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const profile = await requireProfile();
  if (profile.role !== 'admin') redirect('/dashboard');

  const supabase = await createClient();
  const [{ data: users }, { data: sites }] = await Promise.all([
    supabase.from('profiles').select('*, sites(name)').order('created_at', { ascending: false }),
    supabase.from('sites').select('*').order('name'),
  ]);

  return (
    <>
      <PageHeader title="Users" description="Manage console and field accounts, roles and site assignments." />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <UsersManager users={(users ?? []) as any} sites={(sites ?? []) as Site[]} />
    </>
  );
}
