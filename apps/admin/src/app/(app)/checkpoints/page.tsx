import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { CheckpointsManager } from '@/components/checkpoints/checkpoints-manager';
import type { Checkpoint, Site } from '@digilog/shared';

export const dynamic = 'force-dynamic';

export default async function CheckpointsPage() {
  await requireProfile();
  const supabase = await createClient();
  const [{ data: checkpoints }, { data: sites }] = await Promise.all([
    supabase.from('checkpoints').select('*').order('sort_order'),
    supabase.from('sites').select('*').eq('is_active', true).order('name'),
  ]);

  return (
    <>
      <PageHeader title="Checkpoints" description="Patrol checkpoints with QR, NFC and GPS verification." />
      <CheckpointsManager checkpoints={(checkpoints ?? []) as Checkpoint[]} sites={(sites ?? []) as Site[]} />
    </>
  );
}
