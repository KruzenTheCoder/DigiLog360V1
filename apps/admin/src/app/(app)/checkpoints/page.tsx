import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { activeOrgId } from '@/lib/active-org';
import { PageHeader } from '@/components/page-header';
import { CheckpointsManager } from '@/components/checkpoints/checkpoints-manager';
import type { Checkpoint, Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function CheckpointsPage() {
  const profile = await requireProfile();
  const orgId = await activeOrgId(profile);
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;
  const [{ data: checkpoints }, { data: sites }] = await Promise.all([
    sb.from('checkpoints').select('*').eq('org_id', orgId).order('sort_order'),
    sb.from('sites').select('*').eq('org_id', orgId).eq('is_active', true).order('name'),
  ]);

  return (
    <>
      <PageHeader title="Checkpoints" description="Patrol checkpoints with QR, NFC and GPS verification." />
      <CheckpointsManager checkpoints={(checkpoints ?? []) as Checkpoint[]} sites={(sites ?? []) as Site[]} />
    </>
  );
}
