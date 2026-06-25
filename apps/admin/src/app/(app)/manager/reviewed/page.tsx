import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Layers } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isManager } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, SeverityBadge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { ReviewedFilterBar } from '@/components/manager/reviewed-filter-bar';
import { formatDateTime } from '@/lib/utils';
import {
  MANAGER_DECISION_LABELS, MANAGER_DECISION_COLORS,
  SEVERITY_LABELS, SEVERITY_COLORS,
  type ManagerAcknowledgement, type SeverityLevel,
} from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type AckWithBulk = ManagerAcknowledgement & {
  bulk_id: string | null;
};

interface OccLite {
  id: number;
  ob_number: string | null;
  severity: SeverityLevel;
  site_name: string | null;
  occurrence_type: string;
}

type RowEntry =
  | { kind: 'single'; ack: AckWithBulk }
  | {
      kind: 'bulk';
      bulkId: string;
      reviewedAt: string;
      reviewerName: string | null;
      decision: ManagerAcknowledgement['decision'];
      notes: string | null;
      signature: string | null;
      items: AckWithBulk[];
    };

export default async function ReviewedLogsPage({ searchParams }: PageProps) {
  const profile = await requireProfile();
  if (!isManager(profile)) redirect('/dashboard');

  const params = await searchParams;
  const scopeRaw = typeof params.scope === 'string' ? params.scope : 'mine';
  const scope: 'mine' | 'by' | 'all' = (['mine','by','all'] as const).includes(scopeRaw as 'mine'|'by'|'all')
    ? (scopeRaw as 'mine' | 'by' | 'all')
    : 'mine';
  const reviewerFilter = typeof params.reviewer === 'string' ? params.reviewer : null;

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('manager_acknowledgements')
    .select('*')
    .order('reviewed_at', { ascending: false })
    .limit(500);

  if (scope === 'mine') {
    q = q.eq('reviewed_by', profile.id);
  } else if (scope === 'by' && reviewerFilter) {
    q = q.eq('reviewed_by', reviewerFilter);
  }
  // scope === 'all' (or 'by' with no reviewer chosen) → no extra filter.

  const { data } = await q;
  const acks = (data ?? []) as unknown as AckWithBulk[];

  // Build the reviewer dropdown options from the org's manager-ish users so
  // the "By Person" tab can show real names, not just whoever has acked.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reviewersRaw } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, email, role, roles')
    .eq('org_id', profile.org_id)
    .order('full_name', { ascending: true, nullsFirst: false });
  const reviewers = ((reviewersRaw ?? []) as Array<{
    id: string; full_name: string | null; email: string | null; role: string; roles: string[] | null;
  }>)
    .filter((p) => {
      const all = (p.roles && p.roles.length > 0) ? p.roles : [p.role];
      return all.some((r) => ['admin','manager','control_room','super_user'].includes(r));
    })
    .map((p) => ({ id: p.id, name: p.full_name ?? p.email ?? 'Unknown' }));

  // Fetch the occurrence detail for every ack in one round-trip so the
  // bulk-row summary can show severity mix + sites + types without N+1.
  const occIds = Array.from(new Set(acks.map((a) => a.occurrence_id)));
  let occMap = new Map<number, OccLite>();
  if (occIds.length > 0) {
    const { data: occs } = await supabase
      .from('occurrences')
      .select('id, ob_number, severity, site_name, occurrence_type')
      .in('id', occIds);
    occMap = new Map(((occs ?? []) as OccLite[]).map((o) => [o.id, o]));
  }

  // Legacy acknowledgements (signed off before the bulk_id column existed)
  // have no bulk_id, so a bulk sign-off shows up as individual rows. Rebuild
  // the grouping for them: anything sharing the same reviewer + decision +
  // notes + review minute was one sign-off action (DB now() / a single click),
  // so collapse those into one bulk entry too.
  const legacyKey = (a: AckWithBulk) =>
    [
      a.reviewed_by_name ?? '',
      a.decision,
      a.manager_notes ?? '',
      new Date(a.reviewed_at).toISOString().slice(0, 16), // to the minute
    ].join('|');

  const rows: RowEntry[] = [];
  const seenBulk = new Set<string>();
  const seenLegacy = new Set<string>();
  for (const a of acks) {
    if (a.bulk_id) {
      if (seenBulk.has(a.bulk_id)) continue;
      seenBulk.add(a.bulk_id);
      const members = acks.filter((x) => x.bulk_id === a.bulk_id);
      rows.push({
        kind: 'bulk',
        bulkId: a.bulk_id,
        reviewedAt: a.reviewed_at,
        reviewerName: a.reviewed_by_name,
        decision: a.decision,
        notes: a.manager_notes,
        signature: a.signature_data_url ?? null,
        items: members,
      });
    } else {
      const key = legacyKey(a);
      if (seenLegacy.has(key)) continue;
      seenLegacy.add(key);
      const members = acks.filter((x) => !x.bulk_id && legacyKey(x) === key);
      if (members.length > 1) {
        rows.push({
          kind: 'bulk',
          bulkId: `legacy:${key}`,
          reviewedAt: a.reviewed_at,
          reviewerName: a.reviewed_by_name,
          decision: a.decision,
          notes: a.manager_notes,
          signature: a.signature_data_url ?? null,
          items: members,
        });
      } else {
        rows.push({ kind: 'single', ack: a });
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Reviewed Logs"
        description="Every incident you and your team have signed off. Bulk acknowledgements appear as one entry."
      />

      <ReviewedFilterBar
        scope={scope}
        reviewerId={reviewerFilter}
        reviewers={reviewers}
        currentUserName={profile.full_name ?? profile.email ?? 'You'}
      />

      <Card>
        <CardContent className="pt-5">
          <Table>
            <THead>
              <TR><TH>OB #</TH><TH>Decision</TH><TH>Reviewer</TH><TH>Notes</TH><TH>Reviewed</TH></TR>
            </THead>
            <TBody>
              {rows.map((r) =>
                r.kind === 'single' ? (
                  <TR key={`s-${r.ack.id}`}>
                    <TD>
                      <Link
                        href={`/occurrences/${r.ack.occurrence_id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {r.ack.ob_number ?? `#${r.ack.occurrence_id}`}
                      </Link>
                    </TD>
                    <TD>
                      <Badge color={MANAGER_DECISION_COLORS[r.ack.decision]}>
                        {MANAGER_DECISION_LABELS[r.ack.decision]}
                      </Badge>
                    </TD>
                    <TD>{r.ack.reviewed_by_name ?? '—'}</TD>
                    <TD className="max-w-md truncate text-sm">{r.ack.manager_notes}</TD>
                    <TD className="whitespace-nowrap text-xs text-[hsl(var(--muted))]">
                      {formatDateTime(r.ack.reviewed_at)}
                    </TD>
                  </TR>
                ) : (
                  <BulkRow key={`b-${r.bulkId}`} row={r} occMap={occMap} />
                ),
              )}
              {rows.length === 0 && (
                <TR><TD colSpan={5} className="py-8 text-center text-[hsl(var(--muted))]">
                  No reviewed logs yet.
                </TD></TR>
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

// ============================================================================
// Bulk row — summary header + expandable nested list
// ============================================================================
function BulkRow({
  row, occMap,
}: { row: Extract<RowEntry, { kind: 'bulk' }>; occMap: Map<number, OccLite> }) {
  // Derive aggregated metrics from the linked occurrences.
  const occs = row.items
    .map((m) => occMap.get(m.occurrence_id))
    .filter((o): o is OccLite => Boolean(o));

  const severityCounts = new Map<SeverityLevel, number>();
  occs.forEach((o) => severityCounts.set(o.severity, (severityCounts.get(o.severity) ?? 0) + 1));

  const sites = Array.from(new Set(occs.map((o) => o.site_name).filter(Boolean))) as string[];
  const types = Array.from(new Set(occs.map((o) => o.occurrence_type)));

  // OB range — useful when bulks are large.
  const obNumbers = row.items
    .map((m) => m.ob_number)
    .filter((n): n is string => Boolean(n))
    .sort();
  const obRange = obNumbers.length > 1
    ? `${obNumbers[0]} – ${obNumbers[obNumbers.length - 1]}`
    : obNumbers[0] ?? '—';

  return (
    <TR>
      <TD colSpan={5} className="p-0">
        <details className="group border-l-4 border-l-brand/60">
          <summary className="cursor-pointer px-3 py-3 hover:bg-[hsl(var(--surface-alt))]">
            <div className="grid grid-cols-[140px_120px_minmax(0,1.2fr)_minmax(0,1fr)_160px] items-start gap-3">
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
                  <Layers className="h-4 w-4" />
                  {row.items.length} logs
                </span>
                <span className="text-[11px] font-mono text-[hsl(var(--muted))]" title="OB number range">
                  {obRange}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <Badge color={MANAGER_DECISION_COLORS[row.decision]}>
                  {MANAGER_DECISION_LABELS[row.decision]} (bulk)
                </Badge>
                {/* Severity mix — small chips so it scans at a glance. */}
                <div className="flex flex-wrap gap-0.5">
                  {Array.from(severityCounts.entries()).map(([sev, n]) => (
                    <span
                      key={sev}
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{
                        backgroundColor: `${SEVERITY_COLORS[sev]}22`,
                        color: SEVERITY_COLORS[sev],
                      }}
                      title={`${n} × ${SEVERITY_LABELS[sev]}`}
                    >
                      {n} {SEVERITY_LABELS[sev]}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{row.reviewerName ?? '—'}</span>
                {sites.length > 0 && (
                  <span className="truncate text-[11px] text-[hsl(var(--muted))]" title={sites.join(', ')}>
                    {sites.length === 1 ? sites[0] : `${sites.length} sites · ${sites.slice(0, 2).join(', ')}${sites.length > 2 ? '…' : ''}`}
                  </span>
                )}
                {types.length > 0 && (
                  <span className="truncate text-[11px] text-[hsl(var(--muted))]" title={types.join(', ')}>
                    {types.length === 1 ? types[0] : `${types.length} types`}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <span className="line-clamp-2 text-sm">{row.notes ?? '—'}</span>
                {row.signature && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--muted))]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.signature}
                      alt="Manager signature"
                      className="h-6 max-w-[80px] rounded border border-[hsl(var(--border))] bg-white object-contain"
                    />
                    signed
                  </span>
                )}
              </div>

              <span className="whitespace-nowrap text-right text-xs text-[hsl(var(--muted))]">
                {formatDateTime(row.reviewedAt)}
              </span>
            </div>
          </summary>

          <ul className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--surface-alt))]">
            {row.items.map((m) => {
              const occ = occMap.get(m.occurrence_id);
              return (
                <li
                  key={m.id}
                  className="grid grid-cols-[110px_120px_minmax(0,1fr)_160px] gap-3 px-6 py-1.5 text-sm"
                >
                  <Link
                    href={`/occurrences/${m.occurrence_id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {m.ob_number ?? `#${m.occurrence_id}`}
                  </Link>
                  {occ ? <SeverityBadge severity={occ.severity} /> : <span />}
                  <span className="truncate text-[hsl(var(--foreground))]">
                    {occ?.occurrence_type ?? '—'}
                  </span>
                  <span className="truncate text-[hsl(var(--muted))]">
                    {occ?.site_name ?? '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      </TD>
    </TR>
  );
}
