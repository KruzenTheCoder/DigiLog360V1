import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { SlaMatrixForm } from '@/components/settings/sla-matrix-form';
import { SLA_CONFIG, SEVERITIES, type SeverityLevel } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface OverrideRow {
  id: string; severity: SeverityLevel;
  resolve_hours: number; update_minutes: number;
}

export default async function SlaSettingsPage() {
  const profile = await requireProfile();
  if (!isAdmin(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('org_sla_overrides').select('*');
  const overrides = (data ?? []) as OverrideRow[];
  const byKey = new Map(overrides.map((o) => [o.severity, o]));

  const initial = SEVERITIES.map((s) => ({
    severity: s,
    resolve_hours: byKey.get(s)?.resolve_hours ?? SLA_CONFIG[s].resolveHours,
    update_minutes: byKey.get(s)?.update_minutes ?? SLA_CONFIG[s].updateIntervalMinutes,
    is_override: byKey.has(s),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="SLA Matrix"
        description="Override the default response-time targets for your organisation."
      />
      <SlaMatrixForm initial={initial} />
    </div>
  );
}
