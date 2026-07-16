-- ============================================================================
-- DigiLog 360 — Multi-site RLS, self-contained + performant.
--
-- The remote DB never received migration 20260605000007, so the helper
-- functions the site-scoped policies rely on (current_site_ids, the updated
-- current_site_id, can_access_site) may not exist there. This script is
-- self-contained: it (re)creates the helpers, backfills profiles.site_ids,
-- then installs the policies. Idempotent — safe to re-run.
--
-- Performance notes:
--   • Every helper call in a policy is wrapped in (select …) so Postgres
--     evaluates it ONCE per statement (InitPlan) instead of once per row —
--     without this, unfiltered counts scan-and-call across the whole table
--     and hit the statement timeout (the "KPIs show 0" bug).
--   • key_handovers has NO site_id column; it belongs to a site through its
--     key (key_id → keys.site_id), so its policy scopes through keys.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. profiles.site_ids[] (idempotent) + backfill from legacy site_id.
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists site_ids uuid[] not null default '{}'::uuid[];

create index if not exists idx_profiles_site_ids
  on public.profiles using gin (site_ids);

update public.profiles
set site_ids = array[site_id]
where site_id is not null
  and (site_ids is null or array_length(site_ids, 1) is null);

-- ----------------------------------------------------------------------------
-- 1. Helpers.
-- ----------------------------------------------------------------------------
create or replace function public.current_site_ids()
returns uuid[]
language sql stable security definer set search_path = '' as $$
  select case
    when public.is_super_user() then
      coalesce(array(select id from public.sites), array[]::uuid[])
    when public.is_admin() then
      coalesce(
        array(select s.id from public.sites s
              where s.org_id = public.current_org_id()),
        array[]::uuid[]
      )
    else
      coalesce(
        (select
          case
            when array_length(p.site_ids, 1) is not null and p.site_id is not null
              and not (p.site_id = any(p.site_ids))
              then array_append(p.site_ids, p.site_id)
            when array_length(p.site_ids, 1) is not null then p.site_ids
            when p.site_id is not null then array[p.site_id]
            else array[]::uuid[]
          end
         from public.profiles p where p.id = auth.uid()),
        array[]::uuid[]
      )
  end;
$$;

create or replace function public.current_site_id()
returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select site_id from public.profiles where id = auth.uid() and site_id is not null),
    (select site_ids[1] from public.profiles where id = auth.uid()
       and array_length(site_ids, 1) is not null)
  );
$$;

create or replace function public.can_access_site(_site uuid)
returns boolean language sql stable as $$
  select public.is_admin()
      or (_site is not null and _site = any(public.current_site_ids()));
$$;

-- ----------------------------------------------------------------------------
-- 2. Policies (initplan-wrapped helper calls).
-- ----------------------------------------------------------------------------
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

-- key_handovers has NO site_id column — scope through its key. The
-- uncorrelated subquery is planned as a hashed SubPlan (evaluated once).
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

-- ----------------------------------------------------------------------------
-- 3. Supporting index for org+site-scoped counts and lists.
-- ----------------------------------------------------------------------------
create index if not exists idx_occurrences_org_site
  on public.occurrences (org_id, site_id);
