'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ArrowLeft, ExternalLink, Images, LoaderCircle } from 'lucide-react';
import { ImageGallery } from '@/components/occurrences/image-gallery';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, SeverityBadge, StatusBadge } from '@/components/ui/badge';
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

  function handleOccurrenceChange(nextId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextId) params.set('occurrenceId', nextId);
    else params.delete('occurrenceId');
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  if (options.length === 0) {
    return (
      <Card className="overflow-hidden p-0">
        <CardHeader className="border-b bg-slate-50/70 dark:bg-slate-900/40">
          <CardTitle>No Evidence Photos Yet</CardTitle>
          <CardDescription>
            Once occurrence evidence images are uploaded, they will appear here for the control room to review.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-10 text-sm text-[hsl(var(--muted))]">
          No occurrences with photo evidence are available for your current access scope.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <CardHeader className="border-b bg-slate-50/70 dark:bg-slate-900/40">
          <CardTitle>Select Occurrence</CardTitle>
          <CardDescription>
            Choose an OB number to review the occurrence summary and all attached evidence photos.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
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

            <div className="flex flex-wrap items-center gap-2">
              <Badge>{options.length} occurrence{options.length === 1 ? '' : 's'}</Badge>
              <Badge>{selectedImages.length} selected photo{selectedImages.length === 1 ? '' : 's'}</Badge>
              {isPending && (
                <Badge className="gap-1.5">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Loading
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedOccurrence && (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)]">
            <Card className="overflow-hidden p-0">
              <CardHeader className="border-b bg-slate-50/70 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{selectedOccurrence.ob_number ?? `Occurrence ${selectedOccurrence.id}`}</CardTitle>
                    <CardDescription>{selectedOccurrence.occurrence_type}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SeverityBadge severity={selectedOccurrence.severity} />
                    <StatusBadge status={selectedOccurrence.status} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
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
              </CardContent>
            </Card>

            <Card className="overflow-hidden p-0">
              <CardHeader className="border-b bg-slate-50/70 dark:bg-slate-900/40">
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Jump back to control room tools or open the full occurrence record.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-5">
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

                <div className="rounded-xl border bg-slate-50/70 p-4 text-sm dark:bg-slate-900/40">
                  <div className="flex items-center gap-2 font-medium">
                    <Images className="h-4 w-4 text-brand" />
                    Evidence Snapshot
                  </div>
                  <p className="mt-2 text-[hsl(var(--muted))]">
                    {selectedImages.length} photo{selectedImages.length === 1 ? '' : 's'} attached.
                    {latestCapture ? ` Latest capture ${formatDateTime(latestCapture)}.` : ''}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <CardHeader className="border-b bg-slate-50/70 dark:bg-slate-900/40">
              <CardTitle>Evidence Photos</CardTitle>
              <CardDescription>
                Review attached media for {selectedOccurrence.ob_number ?? `occurrence ${selectedOccurrence.id}`}.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <ImageGallery images={selectedImages} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
