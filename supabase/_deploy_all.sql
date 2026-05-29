-- ============================================================
-- DigiLog 360 — full deploy (all migrations + seed, in order)
-- Paste into the Supabase SQL editor and run once.
-- Generated 2026-05-27T22:49:26Z
-- ============================================================

-- >>> migrations/20260527000001_extensions_and_enums.sql
-- ============================================================================
-- DigiLog 360 — Extensions & Enums
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;       -- gen_random_uuid()
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;        -- fuzzy text search

-- ----------------------------------------------------------------------------
-- Roles / access control
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'control_room', 'supervisor', 'guard');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Occurrence domain
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.severity_level as enum ('critical', 'high', 'medium', 'low');
exception when duplicate_object then null; end $$;

-- Unified lifecycle status used by occurrences, reports and updates.
do $$ begin
  create type public.occurrence_status as enum (
    'open', 'acknowledged', 'in_progress', 'on_patrol', 'resolved', 'closed'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Patrols & checkpoints
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.patrol_status as enum ('active', 'completed', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scan_method as enum ('qr', 'nfc', 'gps', 'manual');
exception when duplicate_object then null; end $$;

-- >>> migrations/20260527000002_core_schema.sql
-- ============================================================================
-- DigiLog 360 — Core schema (sites, profiles, occurrences, reports, images)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- sites
-- ----------------------------------------------------------------------------
create table if not exists public.sites (
  id          uuid primary key default extensions.gen_random_uuid(),
  name        text not null unique,
  code        text unique,
  address     text,
  timezone    text not null default 'Africa/Johannesburg',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- profiles (1:1 with auth.users) — replaces ASP.NET Identity ApplicationUser
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        public.app_role not null default 'guard',
  site_id     uuid references public.sites(id) on delete set null,
  phone       text,
  avatar_url  text,
  is_active   boolean not null default true,
  expo_push_token text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_site on public.profiles(site_id);

-- ----------------------------------------------------------------------------
-- occurrences — replaces OccurrenceLog (the core incident / "OB")
-- ----------------------------------------------------------------------------
create sequence if not exists public.ob_number_seq start 1;

create table if not exists public.occurrences (
  id                  bigint generated always as identity primary key,
  ob_number           text unique,
  occurrence_type     text not null,
  severity            public.severity_level not null,
  description         text not null,
  incident_at         timestamptz not null,
  site_id             uuid references public.sites(id) on delete set null,
  site_name           text,                                  -- denormalized snapshot
  logged_by           uuid references public.profiles(id) on delete set null,
  logged_by_name      text,
  status              public.occurrence_status not null default 'open',
  is_patrol           boolean not null default false,
  -- SLA tracking
  sla_hours           integer not null default 0,
  sla_due_at          timestamptz,
  last_sla_update_at  timestamptz,
  closed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists idx_occurrences_status on public.occurrences(status);
create index if not exists idx_occurrences_severity on public.occurrences(severity);
create index if not exists idx_occurrences_site on public.occurrences(site_id);
create index if not exists idx_occurrences_logged_by on public.occurrences(logged_by);
create index if not exists idx_occurrences_incident_at on public.occurrences(incident_at desc);
create index if not exists idx_occurrences_type_trgm on public.occurrences using gin (occurrence_type extensions.gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- occurrence_updates — status updates / SLA compliance notes
-- ----------------------------------------------------------------------------
create table if not exists public.occurrence_updates (
  id              bigint generated always as identity primary key,
  occurrence_id   bigint not null references public.occurrences(id) on delete cascade,
  ob_number       text,
  notes           text not null,
  status          public.occurrence_status not null,
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_updates_occurrence on public.occurrence_updates(occurrence_id);

-- ----------------------------------------------------------------------------
-- occurrence_reports — detailed control-room report (1 per occurrence)
-- ----------------------------------------------------------------------------
create table if not exists public.occurrence_reports (
  id                  bigint generated always as identity primary key,
  occurrence_id       bigint not null unique references public.occurrences(id) on delete cascade,
  ob_number           text,
  severity            public.severity_level,
  occurrence_type     text,
  incident_at         timestamptz,
  location            text,
  reported_by         text,
  description         text not null,
  personnel           text,
  responding_officer  text,
  emergency_services  text,
  external_case       text,
  cctv                text,
  cctv_times          text,
  property_damage     text,
  immediate_actions   text,
  next_steps          text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_by_name     text,
  status              public.occurrence_status not null default 'open',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- occurrence_images — photo evidence (stored in Supabase Storage)
-- ----------------------------------------------------------------------------
create table if not exists public.occurrence_images (
  id                bigint generated always as identity primary key,
  occurrence_id     bigint not null references public.occurrences(id) on delete cascade,
  ob_number         text,
  storage_path      text not null,           -- path within the 'occurrence-images' bucket
  caption           text,
  captured_by       uuid references public.profiles(id) on delete set null,
  captured_by_name  text,
  captured_at       timestamptz not null default now()
);
create index if not exists idx_images_occurrence on public.occurrence_images(occurrence_id);

-- >>> migrations/20260527000003_patrols_checkpoints.sql
-- ============================================================================
-- DigiLog 360 — Patrols, routes, checkpoints & scan events
-- (Checkpoint scanning is a new capability beyond the legacy start/end timer.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- patrol_routes — an ordered set of checkpoints a guard is expected to visit
-- ----------------------------------------------------------------------------
create table if not exists public.patrol_routes (
  id                        uuid primary key default extensions.gen_random_uuid(),
  site_id                   uuid not null references public.sites(id) on delete cascade,
  name                      text not null,
  description               text,
  expected_duration_minutes integer,
  is_active                 boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists idx_routes_site on public.patrol_routes(site_id);

-- ----------------------------------------------------------------------------
-- checkpoints — physical points scanned via QR / NFC / GPS
-- ----------------------------------------------------------------------------
create table if not exists public.checkpoints (
  id                uuid primary key default extensions.gen_random_uuid(),
  site_id           uuid not null references public.sites(id) on delete cascade,
  name              text not null,
  code              text,
  description       text,
  -- Scan identifiers
  qr_token          text not null unique default extensions.gen_random_uuid()::text,
  nfc_tag_id        text unique,
  -- Geofencing
  latitude          double precision,
  longitude         double precision,
  geofence_radius_m integer not null default 50,
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_checkpoints_site on public.checkpoints(site_id);

-- ----------------------------------------------------------------------------
-- route_checkpoints — ordered membership of checkpoints within a route
-- ----------------------------------------------------------------------------
create table if not exists public.route_checkpoints (
  id            uuid primary key default extensions.gen_random_uuid(),
  route_id      uuid not null references public.patrol_routes(id) on delete cascade,
  checkpoint_id uuid not null references public.checkpoints(id) on delete cascade,
  sort_order    integer not null default 0,
  unique (route_id, checkpoint_id)
);
create index if not exists idx_route_checkpoints_route on public.route_checkpoints(route_id);

-- ----------------------------------------------------------------------------
-- patrols — replaces PatrolLog
-- ----------------------------------------------------------------------------
create table if not exists public.patrols (
  id                bigint generated always as identity primary key,
  guard_id          uuid references public.profiles(id) on delete set null,
  guard_name        text not null,
  site_id           uuid references public.sites(id) on delete set null,
  route_id          uuid references public.patrol_routes(id) on delete set null,
  occurrence_id     bigint references public.occurrences(id) on delete set null,
  ob_number         text,
  status            public.patrol_status not null default 'active',
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  duration_minutes  numeric(10,1),
  checkpoints_total integer not null default 0,
  checkpoints_scanned integer not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_patrols_guard on public.patrols(guard_id);
create index if not exists idx_patrols_status on public.patrols(status);
create index if not exists idx_patrols_site on public.patrols(site_id);
-- A guard can only have one active patrol at a time.
create unique index if not exists uq_patrols_one_active_per_guard
  on public.patrols(guard_id) where (status = 'active');

-- ----------------------------------------------------------------------------
-- checkpoint_scans — proof-of-presence events captured during a patrol
-- ----------------------------------------------------------------------------
create table if not exists public.checkpoint_scans (
  id              bigint generated always as identity primary key,
  patrol_id       bigint not null references public.patrols(id) on delete cascade,
  checkpoint_id   uuid references public.checkpoints(id) on delete set null,
  guard_id        uuid references public.profiles(id) on delete set null,
  method          public.scan_method not null,
  scanned_at      timestamptz not null default now(),
  latitude        double precision,
  longitude       double precision,
  gps_accuracy_m  double precision,
  distance_m      double precision,   -- distance from checkpoint when scanned
  is_verified     boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_scans_patrol on public.checkpoint_scans(patrol_id);
create index if not exists idx_scans_checkpoint on public.checkpoint_scans(checkpoint_id);

-- >>> migrations/20260527000004_functions_and_triggers.sql
-- ============================================================================
-- DigiLog 360 — Functions & triggers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Generic updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- SLA configuration (mirrors the legacy severity rules)
--   critical: 1h to resolve,  updates every 30m
--   high:     4h to resolve,  updates every 60m
--   medium:   24h to resolve, updates every 6h
--   low:      168h to resolve, updates every 24h
-- ----------------------------------------------------------------------------
create or replace function public.severity_sla_hours(_sev public.severity_level)
returns integer language sql immutable as $$
  select case _sev
    when 'critical' then 1
    when 'high'     then 4
    when 'medium'   then 24
    when 'low'      then 168
  end;
$$;

create or replace function public.severity_update_interval_minutes(_sev public.severity_level)
returns integer language sql immutable as $$
  select case _sev
    when 'critical' then 30
    when 'high'     then 60
    when 'medium'   then 360
    when 'low'      then 1440
  end;
$$;

-- ----------------------------------------------------------------------------
-- OB number generation: OB0001, OB0002, ...  (BEFORE INSERT on occurrences)
-- ----------------------------------------------------------------------------
create or replace function public.set_ob_number()
returns trigger language plpgsql as $$
begin
  if new.ob_number is null or new.ob_number = '' then
    new.ob_number := 'OB' || lpad(nextval('public.ob_number_seq')::text, 4, '0');
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- SLA application (BEFORE INSERT OR UPDATE on occurrences)
-- ----------------------------------------------------------------------------
create or replace function public.apply_occurrence_sla()
returns trigger language plpgsql as $$
begin
  new.sla_hours := public.severity_sla_hours(new.severity);

  if tg_op = 'INSERT' then
    new.last_sla_update_at := coalesce(new.last_sla_update_at, now());
    new.sla_due_at := coalesce(new.sla_due_at, now() + make_interval(hours => new.sla_hours));
  elsif new.severity is distinct from old.severity then
    -- Recompute the deadline relative to the original logged time on severity change.
    new.sla_due_at := coalesce(old.created_at, now()) + make_interval(hours => new.sla_hours);
  end if;

  -- Stamp closure time when entering a terminal state.
  if new.status in ('resolved', 'closed') and new.closed_at is null then
    new.closed_at := now();
  end if;

  return new;
end $$;

-- ----------------------------------------------------------------------------
-- Patrol metrics (BEFORE UPDATE on patrols)
-- ----------------------------------------------------------------------------
create or replace function public.compute_patrol_metrics()
returns trigger language plpgsql as $$
begin
  if new.ended_at is not null and (old.ended_at is null or new.ended_at <> old.ended_at) then
    new.duration_minutes := round(extract(epoch from (new.ended_at - new.started_at)) / 60.0, 1);
    if new.status = 'active' then
      new.status := 'completed';
    end if;
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- Keep patrols.checkpoints_scanned in sync (AFTER INSERT on checkpoint_scans)
-- ----------------------------------------------------------------------------
create or replace function public.bump_patrol_scan_count()
returns trigger language plpgsql as $$
begin
  update public.patrols
     set checkpoints_scanned = checkpoints_scanned + 1,
         updated_at = now()
   where id = new.patrol_id;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- Provision a profile automatically for every new auth user.
-- Role / site / name are read from the signup metadata.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _role public.app_role;
  _site uuid;
begin
  begin
    _role := (new.raw_user_meta_data ->> 'role')::public.app_role;
  exception when others then
    _role := 'guard';
  end;

  begin
    _site := nullif(new.raw_user_meta_data ->> 'site_id', '')::uuid;
  exception when others then
    _site := null;
  end;

  insert into public.profiles (id, email, full_name, role, site_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(_role, 'guard'),
    _site
  )
  on conflict (id) do nothing;

  return new;
end $$;

-- ============================================================================
-- RLS helper functions (SECURITY DEFINER → bypass RLS, avoid recursion)
-- ============================================================================
create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_site_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select site_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

create or replace function public.has_any_role(_roles public.app_role[])
returns boolean language sql stable as $$
  select coalesce(public.current_app_role() = any(_roles), false);
$$;

-- Can the current user oversee the given site? Admins: all sites. Others: their own.
create or replace function public.can_access_site(_site uuid)
returns boolean language sql stable as $$
  select public.is_admin()
      or (_site is not null and _site = public.current_site_id());
$$;

-- ============================================================================
-- Attach triggers
-- ============================================================================
-- updated_at on every table that has the column
do $$
declare t text;
begin
  foreach t in array array[
    'sites','profiles','occurrences','occurrence_reports',
    'patrol_routes','checkpoints','patrols'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s;', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s
         for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

drop trigger if exists trg_occurrences_ob_number on public.occurrences;
create trigger trg_occurrences_ob_number
  before insert on public.occurrences
  for each row execute function public.set_ob_number();

drop trigger if exists trg_occurrences_sla on public.occurrences;
create trigger trg_occurrences_sla
  before insert or update on public.occurrences
  for each row execute function public.apply_occurrence_sla();

drop trigger if exists trg_patrols_metrics on public.patrols;
create trigger trg_patrols_metrics
  before update on public.patrols
  for each row execute function public.compute_patrol_metrics();

drop trigger if exists trg_scans_bump on public.checkpoint_scans;
create trigger trg_scans_bump
  after insert on public.checkpoint_scans
  for each row execute function public.bump_patrol_scan_count();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- >>> migrations/20260527000005_rls_policies.sql
-- ============================================================================
-- DigiLog 360 — Row Level Security (UAC)
-- Model:
--   admin                       → full access, all sites
--   control_room / supervisor   → manage records for their own site
--   guard                       → own records + read site checkpoints/occurrences
-- The service_role key (used by edge functions) bypasses RLS entirely.
-- ============================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Prevent non-admins from escalating their own role / moving sites.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.role is distinct from old.role) or (new.site_id is distinct from old.site_id) then
    if not (public.is_admin() or auth.uid() is null) then
      raise exception 'Only administrators may change a profile role or site assignment.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_no_escalation on public.profiles;
create trigger trg_profiles_no_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- Enable RLS everywhere.
alter table public.sites               enable row level security;
alter table public.profiles            enable row level security;
alter table public.occurrences         enable row level security;
alter table public.occurrence_updates  enable row level security;
alter table public.occurrence_reports  enable row level security;
alter table public.occurrence_images   enable row level security;
alter table public.patrol_routes       enable row level security;
alter table public.checkpoints         enable row level security;
alter table public.route_checkpoints   enable row level security;
alter table public.patrols             enable row level security;
alter table public.checkpoint_scans    enable row level security;

-- ----------------------------------------------------------------------------
-- sites
-- ----------------------------------------------------------------------------
drop policy if exists sites_select on public.sites;
create policy sites_select on public.sites
  for select to authenticated using (true);

drop policy if exists sites_admin_write on public.sites;
create policy sites_admin_write on public.sites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or public.is_admin()
    or (public.has_any_role(array['control_room','supervisor']::public.app_role[])
        and site_id = public.current_site_id())
  );

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated with check (public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- occurrences
-- ----------------------------------------------------------------------------
drop policy if exists occurrences_select on public.occurrences;
create policy occurrences_select on public.occurrences
  for select to authenticated using (
    public.is_admin()
    or logged_by = auth.uid()
    or site_id = public.current_site_id()
  );

drop policy if exists occurrences_insert on public.occurrences;
create policy occurrences_insert on public.occurrences
  for insert to authenticated with check (
    public.is_admin()
    or (logged_by = auth.uid()
        and (site_id = public.current_site_id() or site_id is null))
  );

drop policy if exists occurrences_update on public.occurrences;
create policy occurrences_update on public.occurrences
  for update to authenticated using (
    public.is_admin()
    or logged_by = auth.uid()
    or (public.has_any_role(array['control_room','supervisor']::public.app_role[])
        and site_id = public.current_site_id())
  ) with check (
    public.is_admin()
    or logged_by = auth.uid()
    or (public.has_any_role(array['control_room','supervisor']::public.app_role[])
        and site_id = public.current_site_id())
  );

drop policy if exists occurrences_delete_admin on public.occurrences;
create policy occurrences_delete_admin on public.occurrences
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- occurrence_updates  (visible if the parent occurrence is visible)
-- ----------------------------------------------------------------------------
drop policy if exists updates_select on public.occurrence_updates;
create policy updates_select on public.occurrence_updates
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
        and (o.logged_by = auth.uid() or o.site_id = public.current_site_id())
    )
  );

drop policy if exists updates_insert on public.occurrence_updates;
create policy updates_insert on public.occurrence_updates
  for insert to authenticated with check (
    public.is_admin()
    or (updated_by = auth.uid()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  );

drop policy if exists updates_admin_modify on public.occurrence_updates;
create policy updates_admin_modify on public.occurrence_updates
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- occurrence_reports
-- ----------------------------------------------------------------------------
drop policy if exists reports_select on public.occurrence_reports;
create policy reports_select on public.occurrence_reports
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
        and (o.logged_by = auth.uid() or o.site_id = public.current_site_id())
    )
  );

drop policy if exists reports_write on public.occurrence_reports;
create policy reports_write on public.occurrence_reports
  for all to authenticated using (
    public.is_admin()
    or public.has_any_role(array['control_room','supervisor']::public.app_role[])
  ) with check (
    public.is_admin()
    or public.has_any_role(array['control_room','supervisor']::public.app_role[])
  );

-- ----------------------------------------------------------------------------
-- occurrence_images
-- ----------------------------------------------------------------------------
drop policy if exists images_select on public.occurrence_images;
create policy images_select on public.occurrence_images
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
        and (o.logged_by = auth.uid() or o.site_id = public.current_site_id())
    )
  );

drop policy if exists images_insert on public.occurrence_images;
create policy images_insert on public.occurrence_images
  for insert to authenticated with check (
    public.is_admin() or captured_by = auth.uid()
  );

drop policy if exists images_delete on public.occurrence_images;
create policy images_delete on public.occurrence_images
  for delete to authenticated using (
    public.is_admin()
    or captured_by = auth.uid()
    or public.has_any_role(array['control_room','supervisor']::public.app_role[])
  );

-- ----------------------------------------------------------------------------
-- patrol_routes / checkpoints / route_checkpoints
--   read: any authenticated user at the site;  write: admin + site management
-- ----------------------------------------------------------------------------
drop policy if exists routes_select on public.patrol_routes;
create policy routes_select on public.patrol_routes
  for select to authenticated
  using (public.is_admin() or site_id = public.current_site_id());

drop policy if exists routes_write on public.patrol_routes;
create policy routes_write on public.patrol_routes
  for all to authenticated using (
    public.is_admin()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  ) with check (
    public.is_admin()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  );

drop policy if exists checkpoints_select on public.checkpoints;
create policy checkpoints_select on public.checkpoints
  for select to authenticated
  using (public.is_admin() or site_id = public.current_site_id());

drop policy if exists checkpoints_write on public.checkpoints;
create policy checkpoints_write on public.checkpoints
  for all to authenticated using (
    public.is_admin()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  ) with check (
    public.is_admin()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  );

drop policy if exists route_checkpoints_select on public.route_checkpoints;
create policy route_checkpoints_select on public.route_checkpoints
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.patrol_routes r
      where r.id = route_id and r.site_id = public.current_site_id()
    )
  );

drop policy if exists route_checkpoints_write on public.route_checkpoints;
create policy route_checkpoints_write on public.route_checkpoints
  for all to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.patrol_routes r
      where r.id = route_id and r.site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[])
    )
  ) with check (
    public.is_admin()
    or exists (
      select 1 from public.patrol_routes r
      where r.id = route_id and r.site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[])
    )
  );

-- ----------------------------------------------------------------------------
-- patrols
-- ----------------------------------------------------------------------------
drop policy if exists patrols_select on public.patrols;
create policy patrols_select on public.patrols
  for select to authenticated using (
    public.is_admin()
    or guard_id = auth.uid()
    or site_id = public.current_site_id()
  );

drop policy if exists patrols_insert on public.patrols;
create policy patrols_insert on public.patrols
  for insert to authenticated with check (
    public.is_admin() or guard_id = auth.uid()
  );

drop policy if exists patrols_update on public.patrols;
create policy patrols_update on public.patrols
  for update to authenticated using (
    public.is_admin()
    or guard_id = auth.uid()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  ) with check (
    public.is_admin()
    or guard_id = auth.uid()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  );

drop policy if exists patrols_delete_admin on public.patrols;
create policy patrols_delete_admin on public.patrols
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- checkpoint_scans  (immutable proof-of-presence)
-- ----------------------------------------------------------------------------
drop policy if exists scans_select on public.checkpoint_scans;
create policy scans_select on public.checkpoint_scans
  for select to authenticated using (
    public.is_admin()
    or guard_id = auth.uid()
    or exists (
      select 1 from public.patrols p
      where p.id = patrol_id and p.site_id = public.current_site_id()
    )
  );

drop policy if exists scans_insert on public.checkpoint_scans;
create policy scans_insert on public.checkpoint_scans
  for insert to authenticated with check (
    public.is_admin()
    or (guard_id = auth.uid()
        and exists (
          select 1 from public.patrols p
          where p.id = patrol_id and p.guard_id = auth.uid()
        ))
  );

drop policy if exists scans_delete_admin on public.checkpoint_scans;
create policy scans_delete_admin on public.checkpoint_scans
  for delete to authenticated using (public.is_admin());

-- >>> migrations/20260527000006_storage_and_realtime.sql
-- ============================================================================
-- DigiLog 360 — Storage (replaces Azure Blob) & Realtime (replaces SignalR)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Private bucket for occurrence photo evidence.
-- Path convention: occurrence-images/<OB_NUMBER>/<uuid>.<ext>
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'occurrence-images',
  'occurrence-images',
  false,
  5242880,                                -- 5 MB, matching the legacy limit
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage object policies (bucket is private; the apps use signed URLs).
drop policy if exists occ_images_read on storage.objects;
create policy occ_images_read on storage.objects
  for select to authenticated
  using (bucket_id = 'occurrence-images');

drop policy if exists occ_images_insert on storage.objects;
create policy occ_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'occurrence-images' and owner = auth.uid());

drop policy if exists occ_images_update on storage.objects;
create policy occ_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'occurrence-images' and (owner = auth.uid() or public.is_admin()));

drop policy if exists occ_images_delete on storage.objects;
create policy occ_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'occurrence-images'
    and (owner = auth.uid()
         or public.has_any_role(array['admin','control_room','supervisor']::public.app_role[]))
  );

-- ----------------------------------------------------------------------------
-- Realtime: publish the live tables the admin console subscribes to.
-- ----------------------------------------------------------------------------
alter table public.occurrences        replica identity full;
alter table public.occurrence_updates replica identity full;
alter table public.patrols            replica identity full;
alter table public.checkpoint_scans   replica identity full;

do $$
declare t text;
begin
  foreach t in array array[
    'occurrences','occurrence_updates','occurrence_reports','patrols','checkpoint_scans'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception
      when duplicate_object then null;   -- already published
      when undefined_object then null;   -- publication not present (non-Supabase env)
    end;
  end loop;
end $$;

-- >>> migrations/20260527000007_views_and_helpers.sql
-- ============================================================================
-- DigiLog 360 — Dashboard views & helper functions
-- ============================================================================

-- Great-circle distance in metres (used for GPS checkpoint verification).
create or replace function public.haversine_m(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- ----------------------------------------------------------------------------
-- occurrences_live — open occurrences with computed SLA state.
-- security_invoker => the querying user's RLS still applies.
-- ----------------------------------------------------------------------------
create or replace view public.occurrences_live
  with (security_invoker = on) as
select
  o.*,
  public.severity_update_interval_minutes(o.severity) as update_interval_minutes,
  (o.status not in ('resolved','closed')
    and o.sla_due_at is not null
    and now() > o.sla_due_at) as is_sla_breached,
  (o.status not in ('resolved','closed')
    and (o.last_sla_update_at is null
         or now() >= o.last_sla_update_at
              + make_interval(mins => public.severity_update_interval_minutes(o.severity)))
  ) as is_sla_update_due,
  case
    when o.status in ('resolved','closed') or o.sla_due_at is null then null
    else round(extract(epoch from (o.sla_due_at - now())) / 60.0)
  end as minutes_remaining,
  (exists (select 1 from public.occurrence_reports r where r.occurrence_id = o.id)) as has_report
from public.occurrences o
where o.status not in ('resolved','closed');

-- ----------------------------------------------------------------------------
-- patrols_detailed — patrol rows enriched with route & scan progress.
-- ----------------------------------------------------------------------------
create or replace view public.patrols_detailed
  with (security_invoker = on) as
select
  p.*,
  r.name as route_name,
  s.name as site_name,
  (select count(*) from public.checkpoint_scans cs where cs.patrol_id = p.id) as scan_count
from public.patrols p
left join public.patrol_routes r on r.id = p.route_id
left join public.sites s on s.id = p.site_id;

grant select on public.occurrences_live to authenticated;
grant select on public.patrols_detailed to authenticated;

-- >>> seed.sql
-- ============================================================================
-- DigiLog 360 — Seed data (idempotent: safe to run multiple times)
-- Run after migrations.  Auth users (admin, guards) are created separately via
-- `scripts/bootstrap-admin.mjs` because passwords must go through the Auth API.
-- ============================================================================

-- Sites (from the legacy hardcoded list) ------------------------------------
insert into public.sites (name, code, address) values
  ('Sandton',    'SAN', 'Sandton, Johannesburg'),
  ('Cape Town',  'CPT', 'Cape Town CBD'),
  ('Boksburg',   'BOK', 'Boksburg, East Rand'),
  ('HQ Central', 'HQ',  'Head Office')
on conflict (name) do nothing;

-- Sample patrol route + checkpoints for HQ Central (idempotent) --------------
do $$
declare
  _site uuid;
  _route uuid;
  _cp uuid;
  _i int;
  _names text[] := array['Main Gate','Reception','Server Room','Parking Level 1','Perimeter North','Loading Bay'];
  _code text;
begin
  select id into _site from public.sites where code = 'HQ';
  if _site is null then return; end if;

  -- Route (look up first; only create if missing)
  select id into _route from public.patrol_routes
    where site_id = _site and name = 'HQ Standard Night Patrol' limit 1;
  if _route is null then
    insert into public.patrol_routes (site_id, name, description, expected_duration_minutes)
    values (_site, 'HQ Standard Night Patrol', 'Full perimeter and interior sweep', 45)
    returning id into _route;
  end if;

  -- Checkpoints + route membership (skip any that already exist)
  for _i in 1 .. array_length(_names, 1) loop
    _code := 'HQ-CP' || lpad(_i::text, 2, '0');

    select id into _cp from public.checkpoints where site_id = _site and code = _code limit 1;
    if _cp is null then
      insert into public.checkpoints (site_id, name, code, sort_order, geofence_radius_m)
      values (_site, _names[_i], _code, _i, 50)
      returning id into _cp;
    end if;

    if _cp is not null and _route is not null then
      insert into public.route_checkpoints (route_id, checkpoint_id, sort_order)
      values (_route, _cp, _i)
      on conflict (route_id, checkpoint_id) do nothing;
    end if;
  end loop;

  -- Keep the route's expected checkpoint count in sync on patrols created later.
  update public.patrol_routes set updated_at = now() where id = _route;
end $$;
