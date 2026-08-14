import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { activeOrgId } from '@/lib/active-org';
import { PageHeader } from '@/components/page-header';
import { KeysBoard } from '@/components/keys/keys-board';
import type { Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface KeyRow {
  id: string; site_id: string | null; code: string; label: string;
  description: string | null; is_active: boolean;
}
interface HandoverRow {
  id: number; key_id: string; taken_by: string; taken_by_id_num: string | null;
  taken_at: string; taken_from_name: string | null;
  returned_at: string | null; returned_to_name: string | null; notes: string | null;
}

export default async function KeysPage() {
  const profile = await requireProfile();
  const orgId = await activeOrgId(profile);
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  const [sitesRes, keysRes, handoversRes] = await Promise.all([
    sb.from('sites').select('*').eq('org_id', orgId).order('name'),
    sb.from('keys').select('*').eq('org_id', orgId).order('code'),
    sb.from('key_handovers').select('*').eq('org_id', orgId).order('taken_at', { ascending: false }).limit(200),
  ]);

  return (
    <>
      <PageHeader title="Key Register" description="Track who has which key, when they took it, and when they returned it." />
      <KeysBoard
        sites={(sitesRes.data ?? []) as Site[]}
        keys={(keysRes.data ?? []) as KeyRow[]}
        handovers={(handoversRes.data ?? []) as HandoverRow[]}
        currentUserId={profile.id}
        currentUserName={profile.full_name ?? profile.email ?? 'Operator'}
      />
    </>
  );
}
