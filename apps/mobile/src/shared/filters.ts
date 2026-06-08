// ============================================================================
// DigiLog 360 — filter ↔ URL search-params helpers
// Single source of truth for how occurrence filters round-trip through URLs.
// Used by the admin app's server pages, client components, and saved views.
// ============================================================================
import { OCCURRENCE_FILTER_KEYS, type OccurrencesFilter } from './types';

/** Parse a URLSearchParams-like object into a typed filter. */
export function parseOccurrencesFilter(
  src: URLSearchParams | Record<string, string | string[] | undefined> | null | undefined,
): OccurrencesFilter {
  const get = (k: string): string | undefined => {
    if (!src) return undefined;
    if (src instanceof URLSearchParams) return src.get(k) ?? undefined;
    const v = (src as Record<string, string | string[] | undefined>)[k];
    if (Array.isArray(v)) return v[0];
    return v ?? undefined;
  };
  const out: OccurrencesFilter = {};
  for (const k of OCCURRENCE_FILTER_KEYS) {
    const v = get(k);
    if (v !== undefined && v !== '') (out as Record<string, string>)[k] = v;
  }
  return out;
}

/** Serialize a filter to a URLSearchParams (only non-empty keys). */
export function serialiseOccurrencesFilter(
  filter: OccurrencesFilter,
  extra: Record<string, string | number | undefined> = {},
): URLSearchParams {
  const params = new URLSearchParams();
  for (const k of OCCURRENCE_FILTER_KEYS) {
    const v = (filter as Record<string, string | undefined>)[k];
    if (v !== undefined && v !== '') params.set(k, v);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  return params;
}

/** Helper: true if any filter field is set (non-empty). */
export function hasAnyFilter(filter: OccurrencesFilter): boolean {
  for (const k of OCCURRENCE_FILTER_KEYS) {
    if ((filter as Record<string, string | undefined>)[k]) return true;
  }
  return false;
}

/** Pagination helpers — we always go through these so the server matches the UI. */
export const DEFAULT_PAGE_SIZE = 50;
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export function clampPageSize(raw: string | number | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  if (n > 500) return 500;
  return Math.floor(n);
}

export function clampPage(raw: string | number | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}
