import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { ImageGallery } from '@/components/occurrences/image-gallery';
import { OccurrenceActions } from '@/components/occurrences/occurrence-actions';
import { AssignmentCard } from '@/components/occurrences/assignment-card';
import { CommentsThread } from '@/components/occurrences/comments-thread';
import { formatDateTime } from '@/lib/utils';
import type {
  Occurrence, OccurrenceUpdate, OccurrenceReport, OccurrenceImage,
  OccurrenceComment, AppRole,
} from '@digilog/shared';

export const dynamic = 'force-dynamic';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">{label}</dt>
      <dd className="mt-0.5 text-sm">{value ?? '—'}</dd>
    </div>
  );
}

export default async function OccurrenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: occ } = await supabase.from('occurrences').select('*').eq('id', Number(id)).single();
  if (!occ) notFound();
  const o = occ as Occurrence;

  const [{ data: updates }, { data: report }, { data: images }, commentsRes, assignablesRes] = await Promise.all([
    supabase.from('occurrence_updates').select('*').eq('occurrence_id', o.id).order('created_at', { ascending: false }),
    supabase.from('occurrence_reports').select('*').eq('occurrence_id', o.id).maybeSingle(),
    supabase.from('occurrence_images').select('*').eq('occurrence_id', o.id).order('captured_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('occurrence_comments').select('*').eq('occurrence_id', o.id).order('created_at', { ascending: true }).then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r, () => ({ data: [] }),
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('profiles').select('id, full_name, email, role')
      .in('role', ['admin', 'manager', 'control_room', 'supervisor'])
      .order('full_name'),
  ]);

  const upd = (updates ?? []) as OccurrenceUpdate[];
  const rep = report as OccurrenceReport | null;
  const imgs = (images ?? []) as OccurrenceImage[];
  const comments = (commentsRes?.data ?? []) as OccurrenceComment[];
  const assignables = (assignablesRes.data ?? []) as { id: string; full_name: string | null; email: string | null; role: AppRole }[];

  return (
    <>
      <PageHeader
        title={o.ob_number ?? `Occurrence ${o.id}`}
        description={o.occurrence_type}
        action={<OccurrenceActions occurrence={o} profile={profile} hasReport={!!rep} />}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Details</CardTitle>
                <div className="flex gap-1"><SeverityBadge severity={o.severity} /><StatusBadge status={o.status} /></div>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Site" value={o.site_name} />
                <Field label="Logged By" value={o.logged_by_name} />
                <Field label="Incident" value={formatDateTime(o.incident_at)} />
                <Field label="Logged" value={formatDateTime(o.created_at)} />
                <Field label="SLA Due" value={formatDateTime(o.sla_due_at)} />
                <Field label="Closed" value={formatDateTime(o.closed_at)} />
              </dl>
              <div className="mt-4">
                <dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">Description</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">{o.description}</dd>
              </div>
            </CardContent>
          </Card>

          {rep && (
            <Card>
              <CardHeader><CardTitle>Occurrence Report</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Personnel" value={rep.personnel} />
                  <Field label="Responding Officer" value={rep.responding_officer} />
                  <Field label="Emergency Services" value={rep.emergency_services} />
                  <Field label="External Case #" value={rep.external_case} />
                  <Field label="CCTV" value={rep.cctv} />
                  <Field label="CCTV Times" value={rep.cctv_times} />
                  <Field label="Property Damage" value={rep.property_damage} />
                </dl>
                {rep.immediate_actions && <div className="mt-3"><dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">Immediate Actions</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{rep.immediate_actions}</dd></div>}
                {rep.next_steps && <div className="mt-3"><dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">Next Steps</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{rep.next_steps}</dd></div>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Photo Evidence</CardTitle></CardHeader>
            <CardContent><ImageGallery images={imgs} /></CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <AssignmentCard
            occurrenceId={o.id}
            // @ts-expect-error column added by 20260603000005 migration
            currentAssigneeId={o.assigned_to ?? null}
            // @ts-expect-error column added by 20260603000005 migration
            currentAssigneeName={o.assigned_to_name ?? null}
            assignables={assignables}
          />

        <Card className="h-fit">
          <CardHeader><CardTitle>Update Timeline</CardTitle></CardHeader>
          <CardContent>
            {upd.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted))]">No updates recorded yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l pl-4">
                {upd.map((u) => (
                  <li key={u.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand" />
                    <div className="flex items-center gap-2">
                      <StatusBadge status={u.status} />
                      <span className="text-xs text-[hsl(var(--muted))]">{formatDateTime(u.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{u.notes}</p>
                    <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">— {u.updated_by_name ?? 'Unknown'}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <CommentsThread
          occurrenceId={o.id}
          obNumber={o.ob_number}
          initial={comments}
          authorId={profile.id}
          authorName={profile.full_name ?? profile.email ?? 'Unknown'}
        />
        </div>
      </div>
    </>
  );
}
