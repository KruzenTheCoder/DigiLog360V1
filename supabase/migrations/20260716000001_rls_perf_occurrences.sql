-- ============================================================================
-- DigiLog 360 — RLS performance: occurrences select policy
--
-- Symptom: any query on public.occurrences WITHOUT an explicit site/org filter
-- (menu KPI counts, unfiltered lists) hit "canceling statement due to
-- statement timeout" for non-admin users and rendered as 0 / empty.
--
-- Cause: the policy called is_super_user() / current_org_id() /
-- current_site_ids() directly, so Postgres re-evaluated them for EVERY row
-- scanned — and each call is itself a query against profiles/sites.
--
-- Fix: wrap each scalar helper in a subselect (hoisted to an InitPlan,
-- evaluated ONCE per statement instead of once per row — the documented
-- Supabase RLS optimisation pattern), and turn the array-membership test into
-- an uncorrelated `IN (select unnest(...))` subquery (planned as a hashed
-- SubPlan, also evaluated once). Semantics unchanged.
-- ============================================================================

drop policy if exists occurrences_select on public.occurrences;
create policy occurrences_select on public.occurrences
  for select to authenticated using (
    deleted_at is null and (
      (select public.is_super_user())
      or (
        org_id = (select public.current_org_id())
        and (
          (select public.is_admin())
          or logged_by = (select auth.uid())
          or site_id in (select unnest(public.current_site_ids()))
        )
      )
    )
  );

-- Same treatment for the other site-scoped tables rewritten in migration
-- 20260605000007 (visitors / keys / key_handovers boards).
drop policy if exists visitors_select on public.visitors;
create policy visitors_select on public.visitors
  for select to authenticated using (
    (select public.is_super_user())
    or (
      org_id = (select public.current_org_id())
      and (
        (select public.is_admin())
        or site_id in (select unnest(public.current_site_ids()))
      )
    )
  );

drop policy if exists keys_select on public.keys;
create policy keys_select on public.keys
  for select to authenticated using (
    (select public.is_super_user())
    or (
      org_id = (select public.current_org_id())
      and (
        (select public.is_admin())
        or site_id in (select unnest(public.current_site_ids()))
      )
    )
  );

-- key_handovers has NO site_id column — a handover belongs to a site through
-- its key (key_id → keys.site_id). The uncorrelated keys subquery is planned
-- as a hashed SubPlan, evaluated once per statement.
drop policy if exists key_handovers_select on public.key_handovers;
create policy key_handovers_select on public.key_handovers
  for select to authenticated using (
    (select public.is_super_user())
    or (
      org_id = (select public.current_org_id())
      and (
        (select public.is_admin())
        or key_id in (
          select k.id from public.keys k
          where k.site_id in (select unnest(public.current_site_ids()))
        )
      )
    )
  );
