import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { can, loadMyCapabilities, requireProfile } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import {
  EvidencePhotosBrowser,
  type EvidenceOption,
} from '@/components/occurrences/evidence-photos-browser';
import type { Occurrence, OccurrenceImage, Profile } from '@digilog/shared';

export const dynamic = 'force-dynamic';

const IMAGE_BATCH_SIZE = 1000;
const OCCURRENCE_CHUNK_SIZE = 200;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type ImageRef = Pick<OccurrenceImage, 'occurrence_id' | 'ob_number' | 'captured_at'>;

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadAllImageRefs() {
  const supabase = await createClient();
  const refs: ImageRef[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('occurrence_images')
      .select('occurrence_id, ob_number, captured_at')
      .order('captured_at', { ascending: false })
      .range(from, from + IMAGE_BATCH_SIZE - 1);

    if (error) {
      console.error('Failed to load evidence photo references', error);
      break;
    }

    const batch = (data ?? []) as ImageRef[];
    refs.push(...batch);
    if (batch.length < IMAGE_BATCH_SIZE) break;
    from += IMAGE_BATCH_SIZE;
  }

  return refs;
}

function ownSiteIds(profile: Profile) {
  const profSiteIds = (profile as Profile & { site_ids?: string[] | null }).site_ids ?? [];
  return Array.from(new Set([
    ...(Array.isArray(profSiteIds) ? profSiteIds : []),
    ...(profile.site_id ? [profile.site_id] : []),
  ]));
}

export default async function OccurrenceEvidencePage({ searchParams }: PageProps) {
  const [profile, caps, params, imageRefs] = await Promise.all([
    requireProfile(),
    loadMyCapabilities(),
    searchParams,
    loadAllImageRefs(),
  ]);

  const canViewEvidence =
    can(caps, 'occurrences.view_all') ||
    can(caps, 'occurrences.view_assigned') ||
    can(caps, 'reports.view');

  if (!canViewEvidence) redirect('/dashboard');

  const isUnscopedRole = profile.role === 'admin' || profile.role === 'super_user';
  const siteIds = ownSiteIds(profile);
  const selectedParam = typeof params.occurrenceId === 'string' ? Number(params.occurrenceId) : NaN;

  let visibleOccurrences: Occurrence[] = [];

  if (isUnscopedRole || siteIds.length > 0) {
    const supabase = await createClient();
    const occurrenceIds = Array.from(new Set(imageRefs.map((row) => row.occurrence_id)));

    const batches = chunk(occurrenceIds, OCCURRENCE_CHUNK_SIZE);
    const results = await Promise.all(
      batches.map(async (ids) => {
        let q = supabase.from('occurrences').select('*').in('id', ids);
        if (!isUnscopedRole) q = q.in('site_id', siteIds);
        const { data, error } = await q;
        if (error) {
          console.error('Failed to load evidence occurrences batch', error);
          return [] as Occurrence[];
        }
        return (data ?? []) as Occurrence[];
      }),
    );
    visibleOccurrences = results.flat();
  }

  const occurrenceMap = new Map(visibleOccurrences.map((occ) => [occ.id, occ]));
  const counts = new Map<number, number>();
  const latestCapture = new Map<number, string>();
  const fallbackOb = new Map<number, string | null>();

  for (const ref of imageRefs) {
    if (!occurrenceMap.has(ref.occurrence_id)) continue;
    counts.set(ref.occurrence_id, (counts.get(ref.occurrence_id) ?? 0) + 1);
    if (!latestCapture.has(ref.occurrence_id)) latestCapture.set(ref.occurrence_id, ref.captured_at);
    if (!fallbackOb.has(ref.occurrence_id)) fallbackOb.set(ref.occurrence_id, ref.ob_number);
  }

  const options: EvidenceOption[] = [];
  const seen = new Set<number>();

  for (const ref of imageRefs) {
    if (seen.has(ref.occurrence_id)) continue;
    const occurrence = occurrenceMap.get(ref.occurrence_id);
    if (!occurrence) continue;
    seen.add(ref.occurrence_id);
    options.push({
      occurrenceId: occurrence.id,
      obNumber: occurrence.ob_number ?? fallbackOb.get(ref.occurrence_id) ?? `Occurrence ${occurrence.id}`,
      siteName: occurrence.site_name,
      occurrenceType: occurrence.occurrence_type,
      incidentAt: occurrence.incident_at,
      severity: occurrence.severity,
      status: occurrence.status,
      imageCount: counts.get(ref.occurrence_id) ?? 0,
      latestCapturedAt: latestCapture.get(ref.occurrence_id) ?? null,
    });
  }

  const selectedId = Number.isFinite(selectedParam) && options.some((item) => item.occurrenceId === selectedParam)
    ? selectedParam
    : (options[0]?.occurrenceId ?? null);

  const selectedOccurrence = selectedId ? occurrenceMap.get(selectedId) ?? null : null;

  let selectedImages: OccurrenceImage[] = [];
  if (selectedOccurrence) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('occurrence_images')
      .select('*')
      .eq('occurrence_id', selectedOccurrence.id)
      .order('captured_at', { ascending: false });
    if (error) console.error('Failed to load selected occurrence images', error);
    else selectedImages = (data ?? []) as OccurrenceImage[];
  }

  return (
    <>
      <PageHeader
        title="Occurrence Evidence Photos"
        description="Control room review of uploaded occurrence photo evidence."
        icon="Images"
        action={(
          <Link
            href="/menu"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-white/30 bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-white/15"
          >
            Back to Control Room
          </Link>
        )}
      />

      <EvidencePhotosBrowser
        options={options}
        selectedOccurrence={selectedOccurrence}
        selectedImages={selectedImages}
      />
    </>
  );
}
