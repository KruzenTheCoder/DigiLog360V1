-- ============================================================================
-- DigiLog 360 — Multi-tenancy, super-user, manager role, PIN auth,
-- and manager acknowledgements (ported from legacy ManagerController).
--
-- This migration is forward-only and additive on top of the original
-- 20260527 migration set. It introduces:
--   • organizations (tenants)
--   • org_id on every domain table (backfilled into a "Default Org")
--   • app_role values: super_user (cross-org god mode), manager (per-org reviewer)
--   • profiles.employee_number + pin_hash (PIN replaces password on mobile)
--   • manager_acknowledgements (legacy Manager workflow)
--   • org-aware RLS helpers + policies (super_user bypasses)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. (Moved) The 'super_user' and 'manager' enum values are added in the
--    preceding migration 20260603000000_app_role_values.sql so that they're
--    committed before any function here references them.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 2. organizations (tenants)
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id              uuid primary key default extensions.gen_random_uuid(),
  name            text not null unique,
  slug            text not null unique,
  legal_name      text,
  contact_email   text,
  contact_phone   text,
  address         text,
  logo_url        text,
  primary_color   text,
  is_active       boolean not null default true,
  -- licensing / billing surface (super_user manages these)
  plan            text not null default 'standard',
  max_users       integer,
  max_sites       integer,
  trial_ends_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_orgs_slug on public.organizations(slug);

drop trigger if exists trg_orgs_updated_at on public.organizations;
create trigger trg_orgs_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Ensure a Default Org exists so we can backfill rows safely.
-- ----------------------------------------------------------------------------
insert into public.organizations (name, slug, legal_name, plan)
values ('Digilog Demo', 'digilog-demo', 'Digilog Demo (Pty) Ltd', 'standard')
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Add org_id to every domain table, backfill, then enforce not-null.
-- ----------------------------------------------------------------------------
do $$
declare
  _default_org uuid;
  _tbl text;
  _tables text[] := array[
    'sites','profiles','occurrences','occurrence_updates','occurrence_reports',
    'occurrence_images','patrol_routes','checkpoints','route_checkpoints',
    'patrols','checkpoint_scans'
  ];
begin
  select id into _default_org from public.organizations where slug = 'digilog-demo' limit 1;

  foreach _tbl in array _tables loop
    -- add column if missing
    execute format($f$
      alter table public.%I
        add column if not exists org_id uuid references public.organizations(id) on delete cascade;
    $f$, _tbl);

    -- backfill nulls
    execute format('update public.%I set org_id = %L where org_id is null;', _tbl, _default_org);

    -- index
    execute format('create index if not exists idx_%1$s_org on public.%1$s(org_id);', _tbl);
  end loop;

  -- Now enforce NOT NULL once every row has an org.
  foreach _tbl in array _tables loop
    execute format('alter table public.%I alter column org_id set not null;', _tbl);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5. profiles: PIN login + employee number + manager attributes
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists employee_number text,
  add column if not exists pin_hash        text,
  add column if not exists pin_set_at      timestamptz,
  add column if not exists last_pin_login_at timestamptz;

-- Employee numbers must be unique per org (mobile login key).
create unique index if not exists uq_profiles_org_employee
  on public.profiles(org_id, lower(employee_number))
  where employee_number is not null;

-- ----------------------------------------------------------------------------
-- 6. manager_acknowledgements — legacy ManagerController workflow.
--    A manager reviews an occurrence (or report) and signs it off.
-- ----------------------------------------------------------------------------
create table if not exists public.manager_acknowledgements (
  id                  bigint generated always as identity primary key,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  occurrence_id       bigint not null references public.occurrences(id) on delete cascade,
  ob_number           text,
  reviewed_by         uuid references public.profiles(id) on delete set null,
  reviewed_by_name    text,
  decision            text not null check (decision in ('acknowledged','escalated','rejected')),
  manager_notes       text,
  signature_data_url  text,
  reviewed_at         timestamptz not null default now(),
  created_at          timestamptz not null default now()
);
create index if not exists idx_ack_occ on public.manager_acknowledgements(occurrence_id);
create index if not exists idx_ack_org on public.manager_acknowledgements(org_id);
alter table public.manager_acknowledgements enable row level security;

-- ----------------------------------------------------------------------------
-- 7. RLS helpers: org-aware
-- ----------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select org_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_user()
returns boolean language sql stable as $$
  select coalesce(public.current_app_role() = 'super_user', false);
$$;

-- Admins still mean "org-level admins"; super_user is global.
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(public.current_app_role() in ('admin','super_user'), false);
$$;

create or replace function public.is_manager()
returns boolean language sql stable as $$
  select coalesce(
    public.current_app_role() in ('manager','admin','super_user'),
    false
  );
$$;

-- Super user sees every row; everyone else is org-scoped.
create or replace function public.can_access_org(_org uuid)
returns boolean language sql stable as $$
  select public.is_super_user()
      or (_org is not null and _org = public.current_org_id());
$$;

create or replace function public.can_access_site(_site uuid)
returns boolean language sql stable as $$
  select public.is_super_user()
      or (
        _site is not null and exists (
          select 1 from public.sites s
          where s.id = _site
            and s.org_id = public.current_org_id()
            and (public.current_app_role() in ('admin','manager','control_room')
                 or s.id = public.current_site_id())
        )
      );
$$;

-- ----------------------------------------------------------------------------
-- 8. handle_new_user: pick up org_id + employee_number from signup metadata.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _role public.app_role;
  _site uuid;
  _org  uuid;
  _emp  text;
begin
  begin _role := (new.raw_user_meta_data ->> 'role')::public.app_role;
  exception when others then _role := 'guard'; end;

  begin _site := nullif(new.raw_user_meta_data ->> 'site_id', '')::uuid;
  exception when others then _site := null; end;

  begin _org  := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;
  exception when others then _org  := null; end;

  _emp := nullif(new.raw_user_meta_data ->> 'employee_number', '');

  -- Fall back to the demo org if metadata didn't supply one (keeps signup safe).
  if _org is null then
    select id into _org from public.organizations where slug = 'digilog-demo' limit 1;
  end if;

  insert into public.profiles (id, email, full_name, role, site_id, org_id, employee_number)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(_role, 'guard'),
    _site,
    _org,
    _emp
  )
  on conflict (id) do nothing;

  return new;
end $$;

-- Re-attach trigger (idempotent).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 9. Prevent privilege escalation: only super_user can create super_user,
--    and admins cannot move users to a different org.
-- ----------------------------------------------------------------------------
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Block role escalation to super_user unless the caller is super_user.
  if new.role = 'super_user' and (old.role is distinct from 'super_user') then
    if not public.is_super_user() then
      raise exception 'Only the super user may grant the super_user role.';
    end if;
  end if;

  -- Block role / site / org change unless caller is admin (org) or super_user.
  if (new.role is distinct from old.role)
     or (new.site_id is distinct from old.site_id)
     or (new.org_id  is distinct from old.org_id) then
    if not (public.is_admin() or auth.uid() is null) then
      raise exception 'Only administrators may change role, site or organization.';
    end if;
    -- Org-level admins cannot move users out of their org.
    if (new.org_id is distinct from old.org_id) and not public.is_super_user() then
      raise exception 'Only the super user may reassign a user to a different organization.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_profiles_no_escalation on public.profiles;
create trigger trg_profiles_no_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- ============================================================================
-- 10. RLS REWRITE — org isolation + super_user bypass + manager visibility
-- ============================================================================

-- organizations: super_user manages; everyone else can read their own org.
alter table public.organizations enable row level security;

drop policy if exists orgs_select on public.organizations;
create policy orgs_select on public.organizations
  for select to authenticated using (
    public.is_super_user() or id = public.current_org_id()
  );

drop policy if exists orgs_super_write on public.organizations;
create policy orgs_super_write on public.organizations
  for all to authenticated
  using (public.is_super_user())
  with check (public.is_super_user());

-- Allow org admins to update their own org's branding / contact fields.
drop policy if exists orgs_admin_update_own on public.organizations;
create policy orgs_admin_update_own on public.organizations
  for update to authenticated
  using (public.is_admin() and id = public.current_org_id())
  with check (public.is_admin() and id = public.current_org_id());

-- ----------------------------------------------------------------------------
-- sites
-- ----------------------------------------------------------------------------
drop policy if exists sites_select on public.sites;
create policy sites_select on public.sites
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists sites_admin_write on public.sites;
create policy sites_admin_write on public.sites
  for all to authenticated
  using (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()));

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    public.is_super_user()
    or id = auth.uid()
    or (
      org_id = public.current_org_id()
      and (
        public.has_any_role(array['admin','manager','control_room']::public.app_role[])
        or site_id = public.current_site_id()
      )
    )
  );

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated with check (
    public.is_super_user()
    or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    public.is_super_user()
    or id = auth.uid()
    or (public.is_admin() and org_id = public.current_org_id())
  )
  with check (
    public.is_super_user()
    or id = auth.uid()
    or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (
    public.is_super_user()
    or (public.is_admin() and org_id = public.current_org_id())
  );

-- ----------------------------------------------------------------------------
-- occurrences
-- ----------------------------------------------------------------------------
drop policy if exists occurrences_select on public.occurrences;
create policy occurrences_select on public.occurrences
  for select to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id() and (
        public.has_any_role(array['admin','manager','control_room']::public.app_role[])
        or logged_by = auth.uid()
        or site_id = public.current_site_id()
      )
    )
  );

drop policy if exists occurrences_insert on public.occurrences;
create policy occurrences_insert on public.occurrences
  for insert to authenticated with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id() and (
        public.is_admin()
        or (logged_by = auth.uid()
            and (site_id = public.current_site_id() or site_id is null))
      )
    )
  );

drop policy if exists occurrences_update on public.occurrences;
create policy occurrences_update on public.occurrences
  for update to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id() and (
        public.has_any_role(array['admin','manager','control_room','supervisor']::public.app_role[])
        or logged_by = auth.uid()
      )
    )
  ) with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id() and (
        public.has_any_role(array['admin','manager','control_room','supervisor']::public.app_role[])
        or logged_by = auth.uid()
      )
    )
  );

drop policy if exists occurrences_delete_admin on public.occurrences;
create policy occurrences_delete_admin on public.occurrences
  for delete to authenticated using (
    public.is_super_user() or (public.is_admin() and org_id = public.current_org_id())
  );

-- ----------------------------------------------------------------------------
-- occurrence_updates / reports / images — visible if parent occurrence visible
-- ----------------------------------------------------------------------------
drop policy if exists updates_select on public.occurrence_updates;
create policy updates_select on public.occurrence_updates
  for select to authenticated using (
    public.is_super_user()
    or (org_id = public.current_org_id()
        and exists (
          select 1 from public.occurrences o
          where o.id = occurrence_id and o.org_id = public.current_org_id()
        ))
  );

drop policy if exists updates_insert on public.occurrence_updates;
create policy updates_insert on public.occurrence_updates
  for insert to authenticated with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and (
        public.is_admin()
        or (updated_by = auth.uid()
            and public.has_any_role(array['control_room','supervisor','manager']::public.app_role[]))
      )
    )
  );

drop policy if exists updates_admin_modify on public.occurrence_updates;
create policy updates_admin_modify on public.occurrence_updates
  for delete to authenticated using (
    public.is_super_user() or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists reports_select on public.occurrence_reports;
create policy reports_select on public.occurrence_reports
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists reports_write on public.occurrence_reports;
create policy reports_write on public.occurrence_reports
  for all to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(array['admin','manager','control_room','supervisor']::public.app_role[])
    )
  ) with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(array['admin','manager','control_room','supervisor']::public.app_role[])
    )
  );

drop policy if exists images_select on public.occurrence_images;
create policy images_select on public.occurrence_images
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists images_insert on public.occurrence_images;
create policy images_insert on public.occurrence_images
  for insert to authenticated with check (
    public.is_super_user()
    or (org_id = public.current_org_id()
        and (public.is_admin() or captured_by = auth.uid()))
  );

drop policy if exists images_delete on public.occurrence_images;
create policy images_delete on public.occurrence_images
  for delete to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and (captured_by = auth.uid()
           or public.has_any_role(array['admin','control_room','supervisor','manager']::public.app_role[]))
    )
  );

-- ----------------------------------------------------------------------------
-- patrol_routes / checkpoints / route_checkpoints
-- ----------------------------------------------------------------------------
drop policy if exists routes_select on public.patrol_routes;
create policy routes_select on public.patrol_routes
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists routes_write on public.patrol_routes;
create policy routes_write on public.patrol_routes
  for all to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(array['admin','control_room','supervisor','manager']::public.app_role[])
    )
  ) with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(array['admin','control_room','supervisor','manager']::public.app_role[])
    )
  );

drop policy if exists checkpoints_select on public.checkpoints;
create policy checkpoints_select on public.checkpoints
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists checkpoints_write on public.checkpoints;
create policy checkpoints_write on public.checkpoints
  for all to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(array['admin','control_room','supervisor','manager']::public.app_role[])
    )
  ) with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(array['admin','control_room','supervisor','manager']::public.app_role[])
    )
  );

drop policy if exists route_checkpoints_select on public.route_checkpoints;
create policy route_checkpoints_select on public.route_checkpoints
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists route_checkpoints_write on public.route_checkpoints;
create policy route_checkpoints_write on public.route_checkpoints
  for all to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(array['admin','control_room','supervisor','manager']::public.app_role[])
    )
  ) with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(array['admin','control_room','supervisor','manager']::public.app_role[])
    )
  );

-- ----------------------------------------------------------------------------
-- patrols / checkpoint_scans
-- ----------------------------------------------------------------------------
drop policy if exists patrols_select on public.patrols;
create policy patrols_select on public.patrols
  for select to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id() and (
        public.has_any_role(array['admin','manager','control_room','supervisor']::public.app_role[])
        or guard_id = auth.uid()
        or site_id = public.current_site_id()
      )
    )
  );

drop policy if exists patrols_insert on public.patrols;
create policy patrols_insert on public.patrols
  for insert to authenticated with check (
    public.is_super_user()
    or (org_id = public.current_org_id()
        and (public.is_admin() or guard_id = auth.uid()))
  );

drop policy if exists patrols_update on public.patrols;
create policy patrols_update on public.patrols
  for update to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id() and (
        public.has_any_role(array['admin','manager','control_room','supervisor']::public.app_role[])
        or guard_id = auth.uid()
      )
    )
  ) with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id() and (
        public.has_any_role(array['admin','manager','control_room','supervisor']::public.app_role[])
        or guard_id = auth.uid()
      )
    )
  );

drop policy if exists patrols_delete_admin on public.patrols;
create policy patrols_delete_admin on public.patrols
  for delete to authenticated using (
    public.is_super_user() or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists scans_select on public.checkpoint_scans;
create policy scans_select on public.checkpoint_scans
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists scans_insert on public.checkpoint_scans;
create policy scans_insert on public.checkpoint_scans
  for insert to authenticated with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and (
        public.is_admin()
        or (guard_id = auth.uid()
            and exists (
              select 1 from public.patrols p
              where p.id = patrol_id and p.guard_id = auth.uid()
            ))
      )
    )
  );

drop policy if exists scans_delete_admin on public.checkpoint_scans;
create policy scans_delete_admin on public.checkpoint_scans
  for delete to authenticated using (
    public.is_super_user() or (public.is_admin() and org_id = public.current_org_id())
  );

-- ----------------------------------------------------------------------------
-- manager_acknowledgements RLS
-- ----------------------------------------------------------------------------
drop policy if exists ack_select on public.manager_acknowledgements;
create policy ack_select on public.manager_acknowledgements
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists ack_write on public.manager_acknowledgements;
create policy ack_write on public.manager_acknowledgements
  for insert to authenticated with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(array['admin','manager']::public.app_role[])
    )
  );

drop policy if exists ack_update on public.manager_acknowledgements;
create policy ack_update on public.manager_acknowledgements
  for update to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and (reviewed_by = auth.uid() or public.is_admin())
    )
  ) with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and (reviewed_by = auth.uid() or public.is_admin())
    )
  );

-- ----------------------------------------------------------------------------
-- Refresh dashboard views that reference the (now org-scoped) tables.
-- security_invoker preserves RLS — no schema change needed, just regrant.
-- ----------------------------------------------------------------------------
grant select on public.organizations to authenticated;

-- ----------------------------------------------------------------------------
-- 11. Realtime: publish new tables for live admin views.
-- ----------------------------------------------------------------------------
alter table public.manager_acknowledgements replica identity full;

do $$
declare t text;
begin
  foreach t in array array['organizations','manager_acknowledgements'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
