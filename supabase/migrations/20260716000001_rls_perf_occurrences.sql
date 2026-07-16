-- ============================================================================
-- DigiLog 360 — Multi-site RLS, self-contained + defensive + performant.
--
-- Self-contained: (re)creates the helper functions the policies rely on
-- (the remote never received migration 20260605000007 that introduced them),
-- backfills profiles.site_ids, then installs the policies.
--
-- Defensive: visitors / keys / key_handovers policies only install when the
-- live table actually has the columns they reference. Some environments have
-- older shapes of these tables ("create table if not exists" skips silently),
-- and a single missing column aborts the whole transaction otherwise. The
-- occurrences policy — the critical one — runs unconditionally.
--
-- Performant: every helper call is wrapped in (select …) so Postgres runs it
-- ONCE per statement (InitPlan) instead of once per row. Without this,
-- unfiltered counts hit the statement timeout and the UI shows 0.
--
-- Idempotent — safe to re-run.
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
-- 2. Occurrences policy — unconditional (columns verified on live schema).
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

create index if not exists idx_occurrences_org_site
  on public.occurrences (org_id, site_id);

-- ----------------------------------------------------------------------------
-- 2b. Occurrences INSERT + UPDATE — multi-site aware. The legacy policies
--     compared against the SINGLE current_site_id(), so a user assigned to
--     sites via site_ids[] (or whose legacy site_id was cleared by the
--     multi-site admin UI) got "new row violates row-level security policy"
--     when logging an occurrence. Any assigned site now qualifies.
--     (org_id is normally stamped by column default; the null-allowance keeps
--     inserts working on environments where that default is missing.)
-- ----------------------------------------------------------------------------
drop policy if exists occurrences_insert on public.occurrences;
create policy occurrences_insert on public.occurrences
  for insert to authenticated with check (
    (select public.is_super_user())
    or (
      (org_id is null or org_id = (select public.current_org_id()))
      and (
        (select public.is_admin())
        or (
          logged_by = (select auth.uid())
          and (site_id is null or site_id in (select unnest(public.current_site_ids())))
        )
      )
    )
  );

drop policy if exists occurrences_update on public.occurrences;
create policy occurrences_update on public.occurrences
  for update to authenticated using (
    (select public.is_super_user())
    or (
      org_id = (select public.current_org_id())
      and (
        (select public.is_admin())
        or logged_by = (select auth.uid())
        or (
          (select public.has_any_role(array['manager','control_room','supervisor']::public.app_role[]))
          and site_id in (select unnest(public.current_site_ids()))
        )
      )
    )
  ) with check (
    (select public.is_super_user())
    or (
      org_id = (select public.current_org_id())
      and (
        (select public.is_admin())
        or logged_by = (select auth.uid())
        or (
          (select public.has_any_role(array['manager','control_room','supervisor']::public.app_role[]))
          and site_id in (select unnest(public.current_site_ids()))
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. visitors / keys / key_handovers — guarded: only when the live table has
--    the columns the policy references; otherwise skip with a NOTICE and
--    leave the table's existing policy untouched.
-- ----------------------------------------------------------------------------
do $$
declare
  has_cols boolean;
begin
  -- visitors: needs org_id + site_id
  select count(*) = 2 into has_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'visitors'
     and column_name in ('org_id', 'site_id');
  if has_cols then
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
  else
    raise notice 'visitors: org_id/site_id missing — policy left unchanged';
  end if;

  -- keys: needs org_id + site_id
  select count(*) = 2 into has_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'keys'
     and column_name in ('org_id', 'site_id');
  if has_cols then
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
  else
    raise notice 'keys: org_id/site_id missing — policy left unchanged';
  end if;

  -- key_handovers: needs org_id + key_id, and keys must have site_id
  -- (a handover belongs to a site THROUGH its key — the table itself has
  -- no site_id column).
  select (
    (select count(*) = 2 from information_schema.columns
      where table_schema = 'public' and table_name = 'key_handovers'
        and column_name in ('org_id', 'key_id'))
    and
    (select count(*) = 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'keys'
        and column_name = 'site_id')
  ) into has_cols;
  if has_cols then
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
  else
    raise notice 'key_handovers: required columns missing — policy left unchanged';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Diagnostic — runs last, shows what the live schema actually has so a
--    skipped section is visible in the Results pane.
-- ----------------------------------------------------------------------------
select table_name,
       string_agg(column_name, ', ' order by column_name) as columns_present
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('occurrences', 'visitors', 'keys', 'key_handovers')
   and column_name in ('org_id', 'site_id', 'key_id', 'deleted_at')
 group by table_name
 order by table_name;
