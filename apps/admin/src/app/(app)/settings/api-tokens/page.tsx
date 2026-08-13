import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { ApiTokensManager } from '@/components/settings/api-tokens-manager';

export const dynamic = 'force-dynamic';

interface TokenRow {
  id: string; name: string; prefix: string;
  scopes: string[]; expires_at: string | null; last_used_at: string | null;
  created_at: string; revoked_at: string | null;
}

export default async function ApiTokensPage() {
  const profile = await requireProfile();
  if (!isAdmin(profile)) redirect('/dashboard');
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('api_tokens').select('*').order('created_at', { ascending: false });

  return (
    <>
      <PageHeader
        title="API Tokens"
        description="Personal tokens scoped to your organisation. Tokens cannot be viewed again after creation — store them securely."
      />
      <ApiTokensManager initial={(data ?? []) as TokenRow[]} />
    </>
  );
}
