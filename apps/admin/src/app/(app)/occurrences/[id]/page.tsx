import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { GradientSection } from '@/components/ui/gradient-section';
import { SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { ImageGallery } from '@/components/occurrences/image-gallery';
import { VoiceNoteGallery } from '@/components/occurrences/voice-note-gallery';
import { OccurrenceActions } from '@/components/occurrences/occurrence-actions';
import { AssignmentCard } from '@/components/occurrences/assignment-card';
import { EscalateCard } from '@/components/occurrences/escalate-card';
import { CommentsThread } from '@/components/occurrences/comments-thread';
import { formatDateTime } from '@/lib/utils';
import {
  STATUS_LABELS, SEVERITY_COLORS, SEVERITY_LABELS,
  type Occurrence, type OccurrenceUpdate, type OccurrenceReport, type OccurrenceImage,
  type OccurrenceComment, type OccurrenceVoiceNote, type AppRole,
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

  const [{ data: updates }, { data: report }, { data: images }, voiceRes, commentsRes, assignablesRes] = await Promise.all([
    supabase.from('occurrence_updates').select('*').eq('occurrence_id', o.id).order('created_at', { ascending: false }),
    supabase.from('occurrence_reports').select('*').eq('occurrence_id', o.id).maybeSingle(),
    supabase.from('occurrence_images').select('*').eq('occurrence_id', o.id).order('captured_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('occurrence_voice_notes').select('*').eq('occurrence_id', o.id).order('created_at', { ascending: true }).then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r, () => ({ data: [] }),
    ),
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
  const voiceNotes = (voiceRes?.data ?? []) as OccurrenceVoiceNote[];
  const comments = (commentsRes?.data ?? []) as OccurrenceComment[];
  const assignables = (assignablesRes.data ?? []) as { id: string; full_name: string | null; email: string | null; role: AppRole }[];

  // Escalation trail + who currently holds it. Separate from the batch above
  // because these columns arrived after this page was written.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbEsc: any = supabase;
  const { data: escRows } = await sbEsc
    .from('occurrence_escalations')
    .select('level, from_name, to_name, reason, created_at')
    .eq('occurrence_id', Number(id))
    .order('level', { ascending: true });
  const escalations = (escRows ?? []) as Array<{
    level: number; from_name: string | null; to_name: string | null;
    reason: string | null; created_at: string;
  }>;
  const escalatedToName = escalations.length ? escalations[escalations.length - 1].to_name : null;

  // The whole detail view is themed to the occurrence's SEVERITY colour
  // (critical = red, high = orange, medium = amber, low = blue): a top accent
  // "lip" + tinted card header, so the severity reads at a glance.
  const sevColor = SEVERITY_COLORS[o.severity];
  // Map the occurrence severity onto a GradientSection tone so every container
  // header still reads the severity at a glance (and matches the Log Occurrence
  // page's gradient-header + left-lip container styling).
  const sevTone: 'red' | 'amber' | 'sky' =
    o.severity === 'critical' ? 'red' : o.severity === 'low' ? 'sky' : 'amber';

  return (
    <>
      <PageHeader
        title={o.ob_number ?? `Occurrence ${o.id}`}
        description={o.occurrence_type}
        action={<OccurrenceActions occurrence={o} hasReport={!!rep} />}
      />

      {/* Severity banner strip — the whole page picks up the severity colour. */}
      <div
        className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-sm"
        style={{ background: `${sevColor}12`, border: `1px solid ${sevColor}40` }}
      >
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: sevColor }} />
        <span className="font-semibold" style={{ color: sevColor }}>{SEVERITY_LABELS[o.severity]}</span>
        <span className="text-[hsl(var(--muted))]">·</span>
        <span className="font-medium text-[hsl(var(--foreground))]">{STATUS_LABELS[o.status]}</span>
        <span className="text-[hsl(var(--muted))]">
          {o.status === 'resolved' || o.status === 'closed'
            ? `· Closed ${formatDateTime(o.closed_at)}`
            : `· SLA due ${formatDateTime(o.sla_due_at)}`}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <GradientSection
            title="Details"
            icon="ClipboardList"
            tone={sevTone}
            actions={<div className="flex gap-1"><SeverityBadge severity={o.severity} /><StatusBadge status={o.status} /></div>}
          >
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
          </GradientSection>

          {rep && (
            <GradientSection title="Occurrence Report" icon="FileText" tone={sevTone}>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Field label="Occurrence Type" value={rep.occurrence_type} />
                  <Field label="All Areas Secure" value={rep.all_areas_secure === null ? '—' : rep.all_areas_secure ? 'Yes' : 'No'} />
                  <Field label="Severity Level" value={rep.severity ? SEVERITY_LABELS[rep.severity] : '—'} />
                  <Field label="Incident Date & Time" value={formatDateTime(rep.incident_at)} />
                  <Field label="Location / Site" value={rep.location} />
                  <Field label="Reported By" value={rep.reported_by} />
                  <Field label="Personnel" value={rep.personnel} />
                  <Field label="Responding Officer" value={rep.responding_officer} />
                  <Field label="Emergency Service Type" value={rep.emergency_services} />
                  <Field label="External Case" value={rep.external_case} />
                  <Field label="CCTV Status" value={rep.cctv} />
                  <Field label="Property Damage" value={rep.property_damage} />
                  <Field label="Report Status" value={STATUS_LABELS[rep.status]} />
                </dl>
                <div className="mt-4">
                  <dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">Incident Description</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm">{rep.description}</dd>
                </div>
                {rep.immediate_actions && <div className="mt-3"><dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">Immediate Actions</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{rep.immediate_actions}</dd></div>}
                {rep.next_steps && <div className="mt-3"><dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">Next Steps</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{rep.next_steps}</dd></div>}
            </GradientSection>
          )}

          <GradientSection title="Photo Evidence" icon="Images" tone={sevTone}>
            <ImageGallery images={imgs} />
          </GradientSection>

          <GradientSection title="Voice Notes" icon="Mic" tone={sevTone}>
            <VoiceNoteGallery notes={voiceNotes} />
          </GradientSection>
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

          <EscalateCard
            occurrenceId={o.id}
            status={String(o.status)}
            escalatedToName={escalatedToName}
            // @ts-expect-error columns added by 20260814000004 migration
            escalationLevel={o.escalation_level ?? 0}
            history={escalations}
          />

        <GradientSection title="Update Timeline" icon="History" tone={sevTone} className="h-fit">
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
        </GradientSection>

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
