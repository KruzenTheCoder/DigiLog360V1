-- Multi-site assignment for profiles. Mirrors the multi-role pattern: the
-- legacy single `site_id` column stays (admin still uses it as the "primary"
-- site for breadcrumbs, default site picker, etc.) while a new `site_ids[]`
-- array carries every site the user is assigned to. RLS helpers consult
-- both and union the results so legacy single-site profiles keep working
-- unchanged.

alter table public.profiles
  add column if not exists site_ids uuid[] not null default '{}'::uuid[];

create index if not exists idx_profiles_site_ids
  on public.profiles using gin (site_ids);

-- New helper: returns every site the caller can act on. Admins / super-user
-- see every site in their org (or globally for super_user) by joining the
-- sites table. Everyone else gets the union of (legacy) site_id + site_ids[].
create or replace function public.current_site_ids()
returns uuid[]
language sql stable security definer set search_path = '' as $$
  select case
    when public.is_super_user() then
      coalesce(array(select id from public.sites), array[]::uuid[])
    when public.is_admin() then
      coalesce(
        array(
          select s.id from public.sites s
          where s.org_id = public.current_org_id()
        ),
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

-- Update can_access_site() to consult the array.
create or replace function public.can_access_site(_site uuid)
returns boolean language sql stable as $$
  select public.is_admin()
      or (_site is not null and _site = any(public.current_site_ids()));
$$;

-- Keep current_site_id() as the "primary" — the first site_id in the array,
-- preferring the legacy column so existing UI defaults don't shift.
create or replace function public.current_site_id()
returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select site_id from public.profiles where id = auth.uid() and site_id is not null),
    (select site_ids[1] from public.profiles where id = auth.uid()
       and array_length(site_ids, 1) is not null)
  );
$$;

-- Backfill: every existing profile with a site_id gets it in site_ids[] too
-- so the union helper isn't doing extra work and so the data shape is
-- consistent for any new queries that ONLY check site_ids[].
update public.profiles
set site_ids = array[site_id]
where site_id is not null
  and (site_ids is null or array_length(site_ids, 1) is null);

-- ----------------------------------------------------------------------------
-- Site-scoped visibility. Managers + control-room used to see every
-- occurrence in their org; now they're restricted to their assigned site(s).
-- Admins (and super_user) still see everything — they're the operators who
-- need full-org reach for compliance + audit.
-- ----------------------------------------------------------------------------
drop policy if exists occurrences_select on public.occurrences;
create policy occurrences_select on public.occurrences
  for select to authenticated using (
    deleted_at is null and (
      public.is_super_user()
      or (
        org_id = public.current_org_id() and (
          public.is_admin()
          or logged_by = auth.uid()
          or site_id = any(public.current_site_ids())
        )
      )
    )
  );

drop policy if exists visitors_select on public.visitors;
create policy visitors_select on public.visitors
  for select to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id() and (
        public.is_admin()
        or site_id = any(public.current_site_ids())
      )
    )
  );

drop policy if exists keys_select on public.keys;
create policy keys_select on public.keys
  for select to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id() and (
        public.is_admin()
        or site_id = any(public.current_site_ids())
      )
    )
  );

-- key_handovers has NO site_id column — a handover belongs to a site through
-- its key (key_id → keys.site_id).
drop policy if exists key_handovers_select on public.key_handovers;
create policy key_handovers_select on public.key_handovers
  for select to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id() and (
        public.is_admin()
        or key_id in (
          select k.id from public.keys k
          where k.site_id = any(public.current_site_ids())
        )
      )
    )
  );
