import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS, type AppRole } from '@digilog/shared';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface AuditRow {
  id: number;
  org_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: AppRole | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  'user.create': '#16a34a',
  'user.update': '#3b82f6',
  'pin.lockout': '#dc2626',
  'pin.admin_reset': '#ea580c',
  'pin.self_change': '#16a34a',
  'auth.pin_login': '#16a34a',
  'profile.update': '#3b82f6',
  'profile.create': '#16a34a',
  'org.create': '#16a34a',
  'org.suspend': '#dc2626',
  'org.activate': '#16a34a',
  'org.plan_change': '#8b5cf6',
};

function colorFor(action: string): string {
  return ACTION_COLORS[action] ?? '#64748b';
}

export default async function AuditLogPage() {
  const profile = await requireProfile();
  if (!isAdmin(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (data ?? []) as AuditRow[];

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Immutable record of sensitive actions — user creation, role changes, PIN resets, org changes."
      />

      <Card className="p-4">
        <Table>
          <THead>
            <TR>
              <TH>When</TH><TH>Action</TH><TH>Actor</TH><TH>Summary</TH><TH>Target</TH><TH>IP</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">
                  {formatDateTime(r.created_at)}
                </TD>
                <TD>
                  <Badge color={colorFor(r.action)}>{r.action}</Badge>
                </TD>
                <TD>
                  <div className="text-sm">{r.actor_name ?? '—'}</div>
                  {r.actor_role && (
                    <div className="text-[11px] text-[hsl(var(--muted))]">
                      {ROLE_LABELS[r.actor_role]}
                    </div>
                  )}
                </TD>
                <TD className="max-w-md text-sm">{r.summary ?? '—'}</TD>
                <TD className="text-xs">
                  {r.target_table ? `${r.target_table}#${r.target_id?.slice(0, 8) ?? '?'}` : '—'}
                </TD>
                <TD className="font-mono text-xs">{r.ip_address ?? '—'}</TD>
              </TR>
            ))}
            {rows.length === 0 && (
              <TR><TD colSpan={6} className="py-8 text-center text-[hsl(var(--muted))]">
                No audit events recorded.
              </TD></TR>
            )}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
