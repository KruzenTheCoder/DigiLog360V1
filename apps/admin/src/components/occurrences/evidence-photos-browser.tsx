'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ArrowLeft, ExternalLink, Images, LoaderCircle } from 'lucide-react';
import { ImageGallery } from '@/components/occurrences/image-gallery';
import { Badge, SeverityBadge, StatusBadge } from '@/components/ui/badge';
import { GradientSection } from '@/components/ui/gradient-section';
import { Label, Select } from '@/components/ui/input';
import { formatDateTime } from '@/lib/utils';
import type { Occurrence, OccurrenceImage } from '@digilog/shared';

export interface EvidenceOption {
  occurrenceId: number;
  obNumber: string;
  siteName: string | null;
  occurrenceType: string;
  incidentAt: string;
  severity: Occurrence['severity'];
  status: Occurrence['status'];
  imageCount: number;
  latestCapturedAt: string | null;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">{label}</dt>
      <dd className="mt-1 text-sm">{value || '—'}</dd>
    </div>
  );
}

export function EvidencePhotosBrowser({
  options,
  selectedOccurrence,
  selectedImages,
}: {
  options: EvidenceOption[];
  selectedOccurrence: Occurrence | null;
  selectedImages: OccurrenceImage[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedId = selectedOccurrence?.id ? String(selectedOccurrence.id) : '';
  const latestCapture = selectedImages[0]?.captured_at ?? null;
  const sevTone =
    selectedOccurrence?.severity === 'critical' ? 'red'
    : selectedOccurrence?.severity === 'high' ? 'amber'
    : selectedOccurrence?.severity === 'medium' ? 'violet'
    : 'sky';

  function handleOccurrenceChange(nextId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) params.set('occurrenceId', nextId);
    else params.delete('occurrenceId');
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  if (options.length === 0) {
    return (
      <GradientSection
        title="No Evidence Photos Yet"
        subtitle="Occurrence evidence images will appear here once uploads are available."
        icon="Images"
        tone="slate"
      >
        <div className="py-5 text-sm text-[hsl(var(--muted))]">
          No occurrences with photo evidence are available for your current access scope.
        </div>
      </GradientSection>
    );
  }

  return (
    <div className="space-y-5">
      <GradientSection
        title="Select Occurrence"
        subtitle="Choose an OB number to review the occurrence summary and all attached evidence photos."
        icon="ClipboardList"
        tone="brand"
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border border-white/25 bg-white/10 text-white">{options.length} occurrence{options.length === 1 ? '' : 's'}</Badge>
            <Badge className="border border-white/25 bg-white/10 text-white">{selectedImages.length} selected photo{selectedImages.length === 1 ? '' : 's'}</Badge>
            {isPending && (
              <Badge className="gap-1.5 border border-white/25 bg-white/10 text-white">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Loading
              </Badge>
            )}
          </div>
        )}
      >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div>
              <Label htmlFor="occurrenceId">OB Number</Label>
              <Select
                id="occurrenceId"
                value={selectedId}
                onChange={(e) => handleOccurrenceChange(e.target.value)}
                disabled={isPending}
              >
                {options.map((option) => (
                  <option key={option.occurrenceId} value={option.occurrenceId}>
                    {option.obNumber} - {option.siteName ?? 'Unknown site'} - {option.imageCount} photo{option.imageCount === 1 ? '' : 's'}
                  </option>
                ))}
              </Select>
            </div>
          </div>
      </GradientSection>

      {selectedOccurrence && (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)]">
            <GradientSection
              title={selectedOccurrence.ob_number ?? `Occurrence ${selectedOccurrence.id}`}
              subtitle={selectedOccurrence.occurrence_type}
              icon="ClipboardList"
              tone={sevTone}
              actions={(
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <SeverityBadge severity={selectedOccurrence.severity} />
                    <StatusBadge status={selectedOccurrence.status} />
                  </div>
                </div>
              )}
            >
                <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Field label="Site" value={selectedOccurrence.site_name} />
                  <Field label="Logged By" value={selectedOccurrence.logged_by_name} />
                  <Field label="Incident Time" value={formatDateTime(selectedOccurrence.incident_at)} />
                  <Field label="Logged At" value={formatDateTime(selectedOccurrence.created_at)} />
                  <Field label="SLA Due" value={formatDateTime(selectedOccurrence.sla_due_at)} />
                  <Field label="Latest Photo" value={formatDateTime(latestCapture)} />
                </dl>

                <div className="mt-5">
                  <dt className="text-xs uppercase tracking-wide text-[hsl(var(--muted))]">Description</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm">{selectedOccurrence.description || '—'}</dd>
                </div>
            </GradientSection>

            <GradientSection
              title="Quick Actions"
              subtitle="Jump back to control room tools or open the full occurrence record."
              icon="ArrowLeft"
              tone="green"
            >
              <div className="space-y-3">
                <Link
                  href="/menu"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border bg-[hsl(var(--surface))] px-4 text-sm font-medium transition hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Control Room
                </Link>
                <Link
                  href={`/occurrences/${selectedOccurrence.id}`}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-gradient px-4 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Full Occurrence
                </Link>

                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm ring-1 ring-emerald-500/10 dark:border-emerald-900/70 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2 font-medium">
                    <Images className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Evidence Snapshot
                  </div>
                  <p className="mt-2 text-[hsl(var(--muted))]">
                    {selectedImages.length} photo{selectedImages.length === 1 ? '' : 's'} attached.
                    {latestCapture ? ` Latest capture ${formatDateTime(latestCapture)}.` : ''}
                  </p>
                </div>
              </div>
            </GradientSection>
          </div>

          <GradientSection
            title="Evidence Photos"
            subtitle={`Review attached media for ${selectedOccurrence.ob_number ?? `occurrence ${selectedOccurrence.id}`}.`}
            icon="Images"
            tone="violet"
          >
            <ImageGallery images={selectedImages} />
          </GradientSection>
        </>
      )}
    </div>
  );
}
