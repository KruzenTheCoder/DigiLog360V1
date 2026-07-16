// Site scoping for data queries — the ONE place that decides which sites a
// user's lists/KPIs cover. Client-safe (no server-only imports), so both
// server pages and client components use the exact same rules.
//
// Rules:
//   • ownSites  = profile.site_ids[] ∪ legacy profile.site_id (deduped).
//   • isUnscoped = user holds admin or super_user in ANY of their roles[]
//     (checking only the primary `role` wrongly scoped multi-role users,
//     e.g. Control Room + Admin).
//
// Usage in queries — ALWAYS narrow explicitly; never rely on RLS alone:
//   if (!scope.isUnscoped) {
//     q = scope.ownSites.length > 0
//       ? q.in('site_id', scope.ownSites)
//       : q.eq('logged_by', profile.id);   // site-less user → own rows only
//   }
// An unfiltered query forces Postgres to evaluate the RLS site predicate
// across the whole table, which hits the statement timeout and surfaces as
// "count = null / no rows" — the "everything shows 0" bug.
import { hasAnyRole, type Profile } from '@digilog/shared';

export interface SiteScope {
  /** Every site the user is assigned to (may be empty). */
  ownSites: string[];
  /** True for admin / super_user (any held role) — org-wide visibility. */
  isUnscoped: boolean;
}

export function siteScope(profile: Profile): SiteScope {
  const raw = (profile as { site_ids?: string[] | null }).site_ids ?? [];
  const ownSites = Array.from(new Set([
    ...(Array.isArray(raw) ? raw : []),
    ...(profile.site_id ? [profile.site_id] : []),
  ]));
  return { ownSites, isUnscoped: hasAnyRole(profile, ['admin', 'super_user']) };
}
