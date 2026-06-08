-- ============================================================
-- DigiLog 360 — full deploy (all migrations + seed, in order)
-- Paste into the Supabase SQL editor and run once.
-- Generated 2026-06-04T08:02:57Z
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
--
-- Use DROP + CREATE rather than OR REPLACE: later migrations add columns to
-- public.occurrences (org_id, assigned_to, deleted_at, …), and `select o.*`
-- expands at parse time. OR REPLACE refuses any column reordering, so re-
-- running this file against an already-evolved schema would fail with
-- "cannot change name of view column".
-- ----------------------------------------------------------------------------
drop view if exists public.occurrences_live cascade;
create view public.occurrences_live
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
-- Same DROP/CREATE rationale as occurrences_live above.
-- ----------------------------------------------------------------------------
drop view if exists public.patrols_detailed cascade;
create view public.patrols_detailed
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


-- >>> migrations/20260603000000_app_role_values.sql
-- ============================================================================
-- DigiLog 360 — Add new app_role enum values in their OWN transaction.
--
-- Why this is its own migration:
--   Postgres requires new enum values from `alter type … add value` to be
--   committed before they can be referenced. The next migration
--   (20260603000001_multi_tenant_and_pin.sql) defines functions like
--   is_super_user() that compare against 'super_user' / 'manager' — those
--   would raise "unsafe use of new value" if added in the same transaction.
--
--   Keeping these ALTER TYPE statements alone in this file guarantees they
--   commit first.
-- ============================================================================

do $$ begin
  alter type public.app_role add value if not exists 'super_user';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.app_role add value if not exists 'manager';
exception when duplicate_object then null; end $$;


-- >>> migrations/20260603000001_multi_tenant_and_pin.sql
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
values ('PMI', 'pmi', 'PMI', 'standard')
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
  select id into _default_org from public.organizations where slug = 'pmi' limit 1;

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
    select id into _org from public.organizations where slug = 'pmi' limit 1;
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


-- >>> migrations/20260603000002_org_defaults.sql
-- ============================================================================
-- DigiLog 360 — Default org_id from current_org_id() for client inserts.
-- Avoids forcing the apps to specify org_id on every insert; RLS still
-- enforces that callers can only write to their own org.
-- ============================================================================

do $$
declare _tbl text;
begin
  foreach _tbl in array array[
    'sites','occurrences','occurrence_updates','occurrence_reports',
    'occurrence_images','patrol_routes','checkpoints','route_checkpoints',
    'patrols','checkpoint_scans','manager_acknowledgements'
  ] loop
    execute format(
      'alter table public.%I alter column org_id set default public.current_org_id();',
      _tbl
    );
  end loop;
end $$;


-- >>> migrations/20260603000003_production_hardening.sql
-- ============================================================================
-- DigiLog 360 — Production hardening
--   • audit_log              (immutable trail of sensitive actions)
--   • pin_attempts           (PIN brute-force tracking + lockout window)
--   • notifications          (per-user inbox; complements push)
--   • soft delete columns    (deleted_at on profiles/sites/occurrences/orgs)
--   • composite indexes      (org_id, ...) for the queries the apps actually run
--   • storage RLS rewrite    (org-scoped path prefix isolation)
--   • helper fns: log_audit_event, check_pin_lockout, register_pin_attempt
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. audit_log
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  org_id        uuid references public.organizations(id) on delete set null,
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_name    text,
  actor_role    public.app_role,
  action        text not null,                -- e.g. 'user.create','pin.reset','org.suspend','occurrence.delete'
  target_table  text,
  target_id     text,                         -- stringified row id (uuid or bigint)
  summary       text,
  metadata      jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_audit_org_created on public.audit_log(org_id, created_at desc);
create index if not exists idx_audit_actor on public.audit_log(actor_id, created_at desc);
create index if not exists idx_audit_action on public.audit_log(action);
alter table public.audit_log enable row level security;

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated using (
    public.is_super_user()
    or (public.is_admin() and org_id = public.current_org_id())
  );

-- Audit is append-only via the helper function (service_role / SECURITY DEFINER).
-- No insert / update / delete policies for regular users.

-- ----------------------------------------------------------------------------
-- 2. pin_attempts (brute-force tracking)
-- ----------------------------------------------------------------------------
create table if not exists public.pin_attempts (
  id            bigint generated always as identity primary key,
  org_slug      text,
  employee_number text,
  profile_id    uuid references public.profiles(id) on delete cascade,
  success       boolean not null,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_pin_attempts_profile on public.pin_attempts(profile_id, created_at desc);
create index if not exists idx_pin_attempts_emp on public.pin_attempts(lower(employee_number), created_at desc);
alter table public.pin_attempts enable row level security;

-- Only super_user and org admins (own org) can read.
drop policy if exists pin_attempts_select on public.pin_attempts;
create policy pin_attempts_select on public.pin_attempts
  for select to authenticated using (
    public.is_super_user()
    or (
      public.is_admin()
      and exists (
        select 1 from public.profiles p
        where p.id = profile_id and p.org_id = public.current_org_id()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. profiles columns to support PIN lockout cleanly
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists locked_until timestamptz,
  add column if not exists deleted_at  timestamptz;

-- ----------------------------------------------------------------------------
-- 4. notifications (per-user inbox)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  org_id      uuid references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,                  -- 'sla.breach','sla.update_due','occurrence.assigned','manager.ack','system'
  title       text not null,
  body        text,
  data        jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_user_unread on public.notifications(user_id, created_at desc)
  where read_at is null;
create index if not exists idx_notif_user_all on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_super_user()
    or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists notif_update_self on public.notifications;
create policy notif_update_self on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notif_delete_self on public.notifications;
create policy notif_delete_self on public.notifications
  for delete to authenticated using (
    user_id = auth.uid() or public.is_super_user()
  );

-- ----------------------------------------------------------------------------
-- 5. Soft-delete columns on the data tables that matter most
-- ----------------------------------------------------------------------------
alter table public.organizations add column if not exists deleted_at timestamptz;
alter table public.sites         add column if not exists deleted_at timestamptz;
alter table public.occurrences   add column if not exists deleted_at timestamptz;

-- Re-publish realtime change for occurrences (no-op if already there).
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Composite indexes that match the apps' real queries
-- ----------------------------------------------------------------------------
create index if not exists idx_occ_org_status on public.occurrences(org_id, status);
create index if not exists idx_occ_org_severity on public.occurrences(org_id, severity);
create index if not exists idx_occ_org_incident_desc on public.occurrences(org_id, incident_at desc);
create index if not exists idx_occ_org_created_desc on public.occurrences(org_id, created_at desc);

create index if not exists idx_patrols_org_status on public.patrols(org_id, status);
create index if not exists idx_patrols_org_started_desc on public.patrols(org_id, started_at desc);

create index if not exists idx_profiles_org_role on public.profiles(org_id, role);
create index if not exists idx_profiles_org_active on public.profiles(org_id, is_active);

create index if not exists idx_reports_org_created_desc on public.occurrence_reports(org_id, created_at desc);
create index if not exists idx_updates_org_created_desc on public.occurrence_updates(org_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 7. RLS: hide soft-deleted rows from non-super_user reads
-- ----------------------------------------------------------------------------
-- Wrap existing policies by re-creating them with `... and deleted_at is null`.
drop policy if exists occurrences_select on public.occurrences;
create policy occurrences_select on public.occurrences
  for select to authenticated using (
    deleted_at is null and (
      public.is_super_user()
      or (
        org_id = public.current_org_id() and (
          public.has_any_role(array['admin','manager','control_room']::public.app_role[])
          or logged_by = auth.uid()
          or site_id = public.current_site_id()
        )
      )
    )
  );

drop policy if exists sites_select on public.sites;
create policy sites_select on public.sites
  for select to authenticated using (
    deleted_at is null and (
      public.is_super_user() or org_id = public.current_org_id()
    )
  );

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    deleted_at is null and (
      public.is_super_user()
      or id = auth.uid()
      or (
        org_id = public.current_org_id()
        and (
          public.has_any_role(array['admin','manager','control_room']::public.app_role[])
          or site_id = public.current_site_id()
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 8. STORAGE: org-scoped path isolation for occurrence-images.
--    Convention: occurrence-images/<org_slug>/<OB_NUMBER>/<uuid>.<ext>
-- ----------------------------------------------------------------------------
-- helper: extract the first path segment (org slug) from storage.objects.name
create or replace function public.storage_path_org_slug(_name text)
returns text language sql immutable as $$
  select split_part(_name, '/', 1);
$$;

-- helper: caller's org slug
create or replace function public.current_org_slug()
returns text language sql stable security definer set search_path = '' as $$
  select o.slug
    from public.organizations o
    join public.profiles p on p.org_id = o.id
   where p.id = auth.uid();
$$;

drop policy if exists occ_images_read on storage.objects;
create policy occ_images_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'occurrence-images'
    and (
      public.is_super_user()
      or public.storage_path_org_slug(name) = public.current_org_slug()
    )
  );

drop policy if exists occ_images_insert on storage.objects;
create policy occ_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'occurrence-images'
    and owner = auth.uid()
    and (
      public.is_super_user()
      or public.storage_path_org_slug(name) = public.current_org_slug()
    )
  );

drop policy if exists occ_images_update on storage.objects;
create policy occ_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'occurrence-images'
    and (
      public.is_super_user()
      or (
        public.storage_path_org_slug(name) = public.current_org_slug()
        and (owner = auth.uid() or public.is_admin())
      )
    )
  );

drop policy if exists occ_images_delete on storage.objects;
create policy occ_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'occurrence-images'
    and (
      public.is_super_user()
      or (
        public.storage_path_org_slug(name) = public.current_org_slug()
        and (
          owner = auth.uid()
          or public.has_any_role(array['admin','control_room','supervisor','manager']::public.app_role[])
        )
      )
    )
  );

-- Org branding bucket (logos). Public, write restricted to org admins.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-branding', 'org-branding', true, 2097152,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
) on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists org_branding_read on storage.objects;
create policy org_branding_read on storage.objects
  for select to public using (bucket_id = 'org-branding');

drop policy if exists org_branding_write on storage.objects;
create policy org_branding_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-branding'
    and owner = auth.uid()
    and (
      public.is_super_user()
      or (
        public.is_admin()
        and public.storage_path_org_slug(name) = public.current_org_slug()
      )
    )
  );

drop policy if exists org_branding_delete on storage.objects;
create policy org_branding_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'org-branding'
    and (
      public.is_super_user()
      or (
        public.is_admin()
        and public.storage_path_org_slug(name) = public.current_org_slug()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 9. Helper functions used by edge functions.
-- ----------------------------------------------------------------------------

-- Append an immutable audit row. Called from edge functions via service_role,
-- and from a few triggers below.
create or replace function public.log_audit_event(
  _action       text,
  _actor_id     uuid default null,
  _org_id       uuid default null,
  _target_table text default null,
  _target_id    text default null,
  _summary      text default null,
  _metadata     jsonb default null,
  _ip           inet default null,
  _user_agent   text default null
) returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  _new_id bigint;
  _actor_name text;
  _actor_role public.app_role;
begin
  if _actor_id is not null then
    select full_name, role into _actor_name, _actor_role
      from public.profiles where id = _actor_id;
  end if;

  insert into public.audit_log (
    org_id, actor_id, actor_name, actor_role, action,
    target_table, target_id, summary, metadata, ip_address, user_agent
  ) values (
    _org_id, _actor_id, _actor_name, _actor_role, _action,
    _target_table, _target_id, _summary, _metadata, _ip, _user_agent
  )
  returning id into _new_id;

  return _new_id;
end $$;

-- PIN lockout: returns the timestamp the account is locked until, or null.
create or replace function public.check_pin_lockout(_profile_id uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select locked_until from public.profiles
   where id = _profile_id and locked_until > now();
$$;

-- Register a PIN attempt. After 5 failures in 15m, lock for 15m.
-- Returns the lockout timestamp (or null if not locked).
create or replace function public.register_pin_attempt(
  _profile_id   uuid,
  _org_slug     text,
  _employee     text,
  _success      boolean,
  _ip           inet default null,
  _user_agent   text default null
) returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  _recent_failures int;
  _new_lock timestamptz;
begin
  insert into public.pin_attempts (
    org_slug, employee_number, profile_id, success, ip_address, user_agent
  ) values (
    _org_slug, _employee, _profile_id, _success, _ip, _user_agent
  );

  if _success then
    -- Clear any lockout on success.
    if _profile_id is not null then
      update public.profiles set locked_until = null
        where id = _profile_id and locked_until is not null;
    end if;
    return null;
  end if;

  if _profile_id is null then
    return null;
  end if;

  -- Count recent failures (15-minute window).
  select count(*) into _recent_failures
    from public.pin_attempts
   where profile_id = _profile_id
     and success = false
     and created_at > now() - interval '15 minutes';

  if _recent_failures >= 5 then
    _new_lock := now() + interval '15 minutes';
    update public.profiles
       set locked_until = _new_lock
     where id = _profile_id;
    perform public.log_audit_event(
      'pin.lockout', _profile_id, null, 'profiles', _profile_id::text,
      format('PIN locked after %s failed attempts', _recent_failures),
      jsonb_build_object('failures', _recent_failures), _ip, _user_agent
    );
    return _new_lock;
  end if;

  return null;
end $$;

-- ----------------------------------------------------------------------------
-- 10. Audit triggers on the most sensitive tables.
-- ----------------------------------------------------------------------------
create or replace function public.audit_profile_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  _changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      _changes := _changes || jsonb_build_object('role', jsonb_build_array(old.role, new.role));
    end if;
    if new.is_active is distinct from old.is_active then
      _changes := _changes || jsonb_build_object('is_active', jsonb_build_array(old.is_active, new.is_active));
    end if;
    if new.site_id is distinct from old.site_id then
      _changes := _changes || jsonb_build_object('site_id', jsonb_build_array(old.site_id, new.site_id));
    end if;
    if new.org_id is distinct from old.org_id then
      _changes := _changes || jsonb_build_object('org_id', jsonb_build_array(old.org_id, new.org_id));
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      _changes := _changes || jsonb_build_object('deleted_at', jsonb_build_array(old.deleted_at, new.deleted_at));
    end if;

    if _changes <> '{}'::jsonb then
      perform public.log_audit_event(
        'profile.update', auth.uid(), new.org_id,
        'profiles', new.id::text,
        format('Profile %s updated', new.email),
        _changes
      );
    end if;
  elsif tg_op = 'INSERT' then
    perform public.log_audit_event(
      'profile.create', auth.uid(), new.org_id,
      'profiles', new.id::text,
      format('Profile %s created (%s)', new.email, new.role)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_audit on public.profiles;
create trigger trg_profiles_audit
  after insert or update on public.profiles
  for each row execute function public.audit_profile_change();

create or replace function public.audit_org_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.is_active is distinct from old.is_active then
      perform public.log_audit_event(
        case when new.is_active then 'org.activate' else 'org.suspend' end,
        auth.uid(), new.id, 'organizations', new.id::text,
        format('Organisation %s %s', new.name,
               case when new.is_active then 'activated' else 'suspended' end)
      );
    end if;
    if new.plan is distinct from old.plan then
      perform public.log_audit_event(
        'org.plan_change', auth.uid(), new.id,
        'organizations', new.id::text,
        format('Plan %s → %s', old.plan, new.plan),
        jsonb_build_object('old', old.plan, 'new', new.plan)
      );
    end if;
  elsif tg_op = 'INSERT' then
    perform public.log_audit_event(
      'org.create', auth.uid(), new.id, 'organizations', new.id::text,
      format('Organisation %s created', new.name)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_orgs_audit on public.organizations;
create trigger trg_orgs_audit
  after insert or update on public.organizations
  for each row execute function public.audit_org_change();

create or replace function public.audit_ack_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.log_audit_event(
    'manager.' || new.decision,
    auth.uid(), new.org_id, 'occurrences', new.occurrence_id::text,
    format('%s: %s — %s', new.ob_number, new.decision, coalesce(new.manager_notes, ''))
  );
  return new;
end $$;

drop trigger if exists trg_ack_audit on public.manager_acknowledgements;
create trigger trg_ack_audit
  after insert on public.manager_acknowledgements
  for each row execute function public.audit_ack_insert();

-- ----------------------------------------------------------------------------
-- 11. Convenient view for unread notification counts.
-- ----------------------------------------------------------------------------
drop view if exists public.notifications_unread_count cascade;
create view public.notifications_unread_count
  with (security_invoker = on) as
select user_id, count(*)::bigint as unread
  from public.notifications
 where read_at is null
 group by user_id;
grant select on public.notifications_unread_count to authenticated;

-- ----------------------------------------------------------------------------
-- 12. Org defaults for new audit/notification/pin_attempts tables.
-- ----------------------------------------------------------------------------
alter table public.notifications alter column org_id set default public.current_org_id();
alter table public.audit_log     alter column org_id set default public.current_org_id();


-- >>> migrations/20260603000004_saved_views.sql
-- ============================================================================
-- DigiLog 360 — Saved Views
-- Per-user named filter snapshots for the occurrences/all surface.
-- Each row is a JSON bundle of search/filter params keyed by user_id.
-- ============================================================================

create table if not exists public.saved_views (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  scope       text not null default 'occurrences',  -- which surface this view targets
  name        text not null,
  filters     jsonb not null default '{}'::jsonb,
  is_pinned   boolean not null default false,
  is_shared   boolean not null default false,       -- false = private; true = visible to same-org admins
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_saved_views_user on public.saved_views(user_id, scope);
create index if not exists idx_saved_views_org_shared on public.saved_views(org_id, scope)
  where is_shared = true;

-- Org defaults from helper (no-op on single-tenant deploys where the fn may not exist).
do $$ begin
  alter table public.saved_views alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

drop trigger if exists trg_saved_views_updated_at on public.saved_views;
create trigger trg_saved_views_updated_at
  before update on public.saved_views
  for each row execute function public.set_updated_at();

alter table public.saved_views enable row level security;

-- Helpers used by RLS. is_super_user() / current_org_id() may not exist in a
-- pre-multi-tenant deploy, so we wrap them.
create or replace function public.saved_views_can_read(_row public.saved_views)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  _is_super boolean := false;
  _my_org uuid := null;
begin
  begin _is_super := public.is_super_user(); exception when others then _is_super := false; end;
  begin _my_org := public.current_org_id(); exception when others then _my_org := null; end;

  return _row.user_id = auth.uid()
      or _is_super
      or (_row.is_shared and _row.org_id is not distinct from _my_org);
end $$;

drop policy if exists saved_views_select on public.saved_views;
create policy saved_views_select on public.saved_views
  for select to authenticated using (public.saved_views_can_read(saved_views));

drop policy if exists saved_views_insert on public.saved_views;
create policy saved_views_insert on public.saved_views
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists saved_views_update_own on public.saved_views;
create policy saved_views_update_own on public.saved_views
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists saved_views_delete_own on public.saved_views;
create policy saved_views_delete_own on public.saved_views
  for delete to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Fuzzy search index on description (we already have it on type).
-- ----------------------------------------------------------------------------
create index if not exists idx_occurrences_desc_trgm
  on public.occurrences using gin (description extensions.gin_trgm_ops);

create index if not exists idx_occurrences_ob_trgm
  on public.occurrences using gin (ob_number extensions.gin_trgm_ops);


-- >>> migrations/20260603000005_assignment_and_comments.sql
-- ============================================================================
-- DigiLog 360 — Assignment + comments
--   • occurrences.assigned_to / assigned_at / assigned_by
--   • occurrence_comments table (free-form thread, distinct from status updates)
-- ============================================================================

alter table public.occurrences
  add column if not exists assigned_to       uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at       timestamptz,
  add column if not exists assigned_by       uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_to_name  text;

create index if not exists idx_occ_assigned_to on public.occurrences(assigned_to)
  where assigned_to is not null;

-- ----------------------------------------------------------------------------
-- occurrence_comments
-- ----------------------------------------------------------------------------
create table if not exists public.occurrence_comments (
  id            bigint generated always as identity primary key,
  org_id        uuid,                        -- defaulted below if multi-tenant
  occurrence_id bigint not null references public.occurrences(id) on delete cascade,
  ob_number     text,
  author_id     uuid references public.profiles(id) on delete set null,
  author_name   text,
  body          text not null,
  edited_at     timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_comments_occ on public.occurrence_comments(occurrence_id, created_at);
create index if not exists idx_comments_author on public.occurrence_comments(author_id);

-- Default org_id if the multi-tenant helper exists.
do $$ begin
  alter table public.occurrence_comments alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

alter table public.occurrence_comments enable row level security;

-- ----------------------------------------------------------------------------
-- RLS — visible if you can see the parent occurrence; writable by reviewers
-- and the comment's author.
-- ----------------------------------------------------------------------------
drop policy if exists comments_select on public.occurrence_comments;
create policy comments_select on public.occurrence_comments
  for select to authenticated using (
    exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
    )
  );

drop policy if exists comments_insert on public.occurrence_comments;
create policy comments_insert on public.occurrence_comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (select 1 from public.occurrences o where o.id = occurrence_id)
  );

drop policy if exists comments_update_own on public.occurrence_comments;
create policy comments_update_own on public.occurrence_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists comments_delete on public.occurrence_comments;
create policy comments_delete on public.occurrence_comments
  for delete to authenticated using (
    author_id = auth.uid()
    or (
      -- Admin / manager can prune their org's threads.
      coalesce((select public.is_admin()), false)
      or coalesce((select public.is_manager()), false)
    )
  );

-- Realtime publication.
do $$ begin
  alter publication supabase_realtime add table public.occurrence_comments;
exception when duplicate_object then null;
when undefined_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Audit + notification when an occurrence gets assigned.
-- ----------------------------------------------------------------------------
create or replace function public.audit_occurrence_assignment()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.assigned_to is distinct from old.assigned_to then
    new.assigned_at := now();
    new.assigned_by := auth.uid();
    if new.assigned_to is not null then
      select full_name into new.assigned_to_name
        from public.profiles where id = new.assigned_to;

      -- Notify the assignee (best-effort — table may not exist on old deploys).
      begin
        insert into public.notifications (org_id, user_id, kind, title, body, data)
        values (
          new.org_id, new.assigned_to, 'occurrence.assigned',
          format('Assigned: %s', coalesce(new.ob_number, '#' || new.id)),
          format('%s — %s', new.occurrence_type, left(new.description, 140)),
          jsonb_build_object('occurrence_id', new.id, 'ob_number', new.ob_number)
        );
      exception when undefined_table then null; end;

      -- Audit log.
      begin
        perform public.log_audit_event(
          'occurrence.assign', auth.uid(), new.org_id,
          'occurrences', new.id::text,
          format('%s assigned to %s', coalesce(new.ob_number, '#' || new.id), new.assigned_to_name)
        );
      exception when undefined_function then null; end;
    else
      new.assigned_to_name := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_occ_assignment on public.occurrences;
create trigger trg_occ_assignment
  before update on public.occurrences
  for each row execute function public.audit_occurrence_assignment();


-- >>> migrations/20260603000006_org_settings.sql
-- ============================================================================
-- DigiLog 360 — Per-org config: SLA overrides, custom occurrence types,
-- notification preferences (email, push toggles).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. org_sla_overrides — per-severity hour overrides
-- ----------------------------------------------------------------------------
create table if not exists public.org_sla_overrides (
  id              uuid primary key default extensions.gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  severity        public.severity_level not null,
  resolve_hours   integer not null check (resolve_hours > 0),
  update_minutes  integer not null check (update_minutes > 0),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id) on delete set null,
  unique (org_id, severity)
);
alter table public.org_sla_overrides enable row level security;

drop policy if exists sla_overrides_select on public.org_sla_overrides;
create policy sla_overrides_select on public.org_sla_overrides
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists sla_overrides_write on public.org_sla_overrides;
create policy sla_overrides_write on public.org_sla_overrides
  for all to authenticated
  using (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()));

-- Rewrite the SLA hour fn so org overrides win.
create or replace function public.severity_sla_hours(_sev public.severity_level)
returns integer language sql stable as $$
  select coalesce(
    (select resolve_hours from public.org_sla_overrides
       where org_id = public.current_org_id() and severity = _sev limit 1),
    case _sev
      when 'critical' then 1
      when 'high'     then 4
      when 'medium'   then 24
      when 'low'      then 168
    end
  );
$$;

create or replace function public.severity_update_interval_minutes(_sev public.severity_level)
returns integer language sql stable as $$
  select coalesce(
    (select update_minutes from public.org_sla_overrides
       where org_id = public.current_org_id() and severity = _sev limit 1),
    case _sev
      when 'critical' then 30
      when 'high'     then 60
      when 'medium'   then 360
      when 'low'      then 1440
    end
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. org_occurrence_types — custom types per org
-- ----------------------------------------------------------------------------
create table if not exists public.org_occurrence_types (
  id              uuid primary key default extensions.gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  default_severity public.severity_level,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

-- Case-insensitive uniqueness of (org_id, name) — has to be a separate index
-- because inline UNIQUE constraints can't contain expressions like lower().
create unique index if not exists uq_org_occurrence_types_name_ci
  on public.org_occurrence_types (org_id, lower(name));

alter table public.org_occurrence_types enable row level security;

drop policy if exists types_select on public.org_occurrence_types;
create policy types_select on public.org_occurrence_types
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists types_write on public.org_occurrence_types;
create policy types_write on public.org_occurrence_types
  for all to authenticated
  using (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()));

-- ----------------------------------------------------------------------------
-- 3. user notification preferences (per-user, per-channel)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email_notifications boolean not null default true,
  add column if not exists push_notifications  boolean not null default true,
  add column if not exists notify_on_assignment boolean not null default true,
  add column if not exists notify_on_sla_breach boolean not null default true;


-- >>> migrations/20260603000007_webhooks_and_tokens.sql
-- ============================================================================
-- DigiLog 360 — Outbound webhooks + API tokens for external integrations.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. webhooks
-- ----------------------------------------------------------------------------
create table if not exists public.org_webhooks (
  id              uuid primary key default extensions.gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  url             text not null,
  secret          text not null,            -- HMAC SHA256 key (raw, server-side only)
  events          text[] not null default array['occurrence.created','sla.breach'],
  is_active       boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_delivered_at timestamptz,
  last_status     int
);
alter table public.org_webhooks enable row level security;

drop policy if exists webhooks_read on public.org_webhooks;
create policy webhooks_read on public.org_webhooks
  for select to authenticated using (
    public.is_super_user() or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists webhooks_write on public.org_webhooks;
create policy webhooks_write on public.org_webhooks
  for all to authenticated
  using (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()));

-- ----------------------------------------------------------------------------
-- 2. webhook_deliveries — last 200 deliveries per webhook for inspection
-- ----------------------------------------------------------------------------
create table if not exists public.webhook_deliveries (
  id            bigint generated always as identity primary key,
  webhook_id    uuid not null references public.org_webhooks(id) on delete cascade,
  org_id        uuid,
  event         text not null,
  status        int,
  request_body  jsonb,
  response_body text,
  delivered_at  timestamptz not null default now()
);
create index if not exists idx_webhook_deliveries_wh on public.webhook_deliveries(webhook_id, delivered_at desc);
alter table public.webhook_deliveries enable row level security;

drop policy if exists deliveries_read on public.webhook_deliveries;
create policy deliveries_read on public.webhook_deliveries
  for select to authenticated using (
    public.is_super_user() or (public.is_admin() and org_id = public.current_org_id())
  );

-- ----------------------------------------------------------------------------
-- 3. api_tokens
-- ----------------------------------------------------------------------------
create table if not exists public.api_tokens (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  prefix        text not null,                  -- public prefix shown in lists (e.g. "dl_live_abcd")
  hashed_secret text not null,                  -- SHA-256 of the full token (server stores only hash)
  scopes        text[] not null default array['read:occurrences'],
  created_by    uuid references public.profiles(id) on delete set null,
  expires_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists idx_api_tokens_org on public.api_tokens(org_id) where revoked_at is null;
create index if not exists idx_api_tokens_prefix on public.api_tokens(prefix);
alter table public.api_tokens enable row level security;

drop policy if exists tokens_read on public.api_tokens;
create policy tokens_read on public.api_tokens
  for select to authenticated using (
    public.is_super_user() or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists tokens_write on public.api_tokens;
create policy tokens_write on public.api_tokens
  for all to authenticated
  using (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()));

-- ----------------------------------------------------------------------------
-- 4. Trigger: when an occurrence is created, enqueue a webhook job.
--    We don't deliver inline — we just notify edge functions via NOTIFY.
-- ----------------------------------------------------------------------------
create or replace function public.notify_occurrence_event()
returns trigger language plpgsql as $$
begin
  perform pg_notify('digilog_events', json_build_object(
    'event', case when tg_op = 'INSERT' then 'occurrence.created' else 'occurrence.updated' end,
    'org_id', new.org_id,
    'occurrence_id', new.id,
    'ob_number', new.ob_number,
    'severity', new.severity,
    'status', new.status
  )::text);
  return new;
end $$;

drop trigger if exists trg_occ_notify on public.occurrences;
create trigger trg_occ_notify
  after insert or update of status on public.occurrences
  for each row execute function public.notify_occurrence_event();


-- >>> migrations/20260603000008_visitors_and_keys.sql
-- ============================================================================
-- DigiLog 360 — Gate-house staples: visitor log + key register
-- ============================================================================

-- ----------------------------------------------------------------------------
-- visitors
-- ----------------------------------------------------------------------------
create table if not exists public.visitors (
  id              uuid primary key default extensions.gen_random_uuid(),
  org_id          uuid,
  site_id         uuid references public.sites(id) on delete set null,
  site_name       text,
  full_name       text not null,
  id_number       text,                          -- ID / passport
  company         text,
  vehicle_reg     text,
  visiting        text,
  reason          text,
  signed_in_at    timestamptz not null default now(),
  signed_in_by    uuid references public.profiles(id) on delete set null,
  signed_in_by_name text,
  signed_out_at   timestamptz,
  signed_out_by   uuid references public.profiles(id) on delete set null,
  signature_data_url text,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_visitors_site on public.visitors(site_id, signed_in_at desc);
create index if not exists idx_visitors_active on public.visitors(site_id) where signed_out_at is null;
alter table public.visitors enable row level security;

do $$ begin
  alter table public.visitors alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

drop policy if exists visitors_read on public.visitors;
create policy visitors_read on public.visitors
  for select to authenticated using (
    coalesce(public.is_super_user(), false)
    or org_id = public.current_org_id()
    or signed_in_by = auth.uid()
  );

drop policy if exists visitors_insert on public.visitors;
create policy visitors_insert on public.visitors
  for insert to authenticated
  with check (
    coalesce(public.is_super_user(), false)
    or signed_in_by = auth.uid()
  );

drop policy if exists visitors_update on public.visitors;
create policy visitors_update on public.visitors
  for update to authenticated
  using (
    coalesce(public.is_super_user(), false)
    or signed_in_by = auth.uid()
    or coalesce(public.is_admin(), false)
    or coalesce(public.is_manager(), false)
  );

-- ----------------------------------------------------------------------------
-- keys + key_handovers
-- ----------------------------------------------------------------------------
create table if not exists public.keys (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid,
  site_id     uuid references public.sites(id) on delete cascade,
  code        text not null,
  label       text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (site_id, code)
);
create index if not exists idx_keys_site on public.keys(site_id);
alter table public.keys enable row level security;

do $$ begin
  alter table public.keys alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

drop policy if exists keys_read on public.keys;
create policy keys_read on public.keys
  for select to authenticated using (
    coalesce(public.is_super_user(), false) or org_id = public.current_org_id()
  );

drop policy if exists keys_write on public.keys;
create policy keys_write on public.keys
  for all to authenticated
  using (coalesce(public.is_super_user(), false) or (coalesce(public.is_admin(), false) and org_id = public.current_org_id()))
  with check (coalesce(public.is_super_user(), false) or (coalesce(public.is_admin(), false) and org_id = public.current_org_id()));

create table if not exists public.key_handovers (
  id            bigint generated always as identity primary key,
  org_id        uuid,
  key_id        uuid not null references public.keys(id) on delete cascade,
  taken_by      text not null,                  -- free text — visitor or employee
  taken_by_id_num text,
  taken_at      timestamptz not null default now(),
  taken_from    uuid references public.profiles(id) on delete set null,
  taken_from_name text,
  returned_at   timestamptz,
  returned_to   uuid references public.profiles(id) on delete set null,
  returned_to_name text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_handovers_key on public.key_handovers(key_id, taken_at desc);
create index if not exists idx_handovers_open on public.key_handovers(key_id) where returned_at is null;
alter table public.key_handovers enable row level security;

do $$ begin
  alter table public.key_handovers alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

drop policy if exists handovers_read on public.key_handovers;
create policy handovers_read on public.key_handovers
  for select to authenticated using (
    coalesce(public.is_super_user(), false) or org_id = public.current_org_id()
  );

drop policy if exists handovers_write on public.key_handovers;
create policy handovers_write on public.key_handovers
  for all to authenticated
  using (
    coalesce(public.is_super_user(), false)
    or taken_from = auth.uid() or returned_to = auth.uid()
    or coalesce(public.is_admin(), false)
    or coalesce(public.is_manager(), false)
  )
  with check (
    coalesce(public.is_super_user(), false)
    or taken_from = auth.uid()
    or coalesce(public.is_admin(), false)
  );


-- >>> migrations/20260603000009_shifts.sql
-- ============================================================================
-- DigiLog 360 — Shifts & handover
-- ============================================================================

create table if not exists public.shifts (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid,
  site_id       uuid references public.sites(id) on delete cascade,
  site_name     text,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  user_name     text,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_minutes numeric(10,1),
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_shifts_user on public.shifts(user_id, started_at desc);
create index if not exists idx_shifts_site_open on public.shifts(site_id) where ended_at is null;
alter table public.shifts enable row level security;

do $$ begin
  alter table public.shifts alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

-- Only one open shift per user at a time.
create unique index if not exists uq_shifts_one_open_per_user
  on public.shifts(user_id) where ended_at is null;

drop policy if exists shifts_read on public.shifts;
create policy shifts_read on public.shifts
  for select to authenticated using (
    coalesce(public.is_super_user(), false)
    or user_id = auth.uid()
    or org_id = public.current_org_id()
  );

drop policy if exists shifts_insert on public.shifts;
create policy shifts_insert on public.shifts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists shifts_update on public.shifts;
create policy shifts_update on public.shifts
  for update to authenticated
  using (
    user_id = auth.uid()
    or coalesce(public.is_admin(), false)
    or coalesce(public.is_manager(), false)
  );

-- Auto-compute duration on close.
create or replace function public.compute_shift_duration()
returns trigger language plpgsql as $$
begin
  if new.ended_at is not null and (old.ended_at is null or new.ended_at <> old.ended_at) then
    new.duration_minutes := round(extract(epoch from (new.ended_at - new.started_at)) / 60.0, 1);
  end if;
  return new;
end $$;

drop trigger if exists trg_shifts_duration on public.shifts;
create trigger trg_shifts_duration
  before update on public.shifts
  for each row execute function public.compute_shift_duration();

-- ----------------------------------------------------------------------------
-- shift_handovers — one row per change of shift, ties outgoing → incoming
-- ----------------------------------------------------------------------------
create table if not exists public.shift_handovers (
  id              bigint generated always as identity primary key,
  org_id          uuid,
  site_id         uuid references public.sites(id) on delete cascade,
  outgoing_user_id uuid references public.profiles(id) on delete set null,
  outgoing_name   text,
  incoming_user_id uuid references public.profiles(id) on delete set null,
  incoming_name   text,
  occurred_at     timestamptz not null default now(),
  summary         text not null,
  open_issues     text,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_handovers_site on public.shift_handovers(site_id, occurred_at desc);
alter table public.shift_handovers enable row level security;

do $$ begin
  alter table public.shift_handovers alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

drop policy if exists sh_read on public.shift_handovers;
create policy sh_read on public.shift_handovers
  for select to authenticated using (
    coalesce(public.is_super_user(), false) or org_id = public.current_org_id()
  );

drop policy if exists sh_write on public.shift_handovers;
create policy sh_write on public.shift_handovers
  for insert to authenticated with check (outgoing_user_id = auth.uid());

drop policy if exists sh_update on public.shift_handovers;
create policy sh_update on public.shift_handovers
  for update to authenticated using (
    incoming_user_id = auth.uid()
    or coalesce(public.is_admin(), false)
    or coalesce(public.is_manager(), false)
  );


-- >>> migrations/20260603000010_patrol_schedules.sql
-- ============================================================================
-- DigiLog 360 — Recurring patrol schedules + expected_patrols + late escalation
-- ============================================================================

-- ----------------------------------------------------------------------------
-- patrol_schedules — a recurring expectation: "Route X must run every N hours
-- between START_HOUR and END_HOUR each day".
-- ----------------------------------------------------------------------------
create table if not exists public.patrol_schedules (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid,
  route_id       uuid not null references public.patrol_routes(id) on delete cascade,
  site_id        uuid references public.sites(id) on delete set null,
  name           text not null,
  interval_minutes integer not null check (interval_minutes >= 15),
  start_hour     int not null default 0  check (start_hour >= 0 and start_hour < 24),
  end_hour       int not null default 24 check (end_hour > 0 and end_hour <= 24),
  grace_minutes  int not null default 15,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_schedules_route on public.patrol_schedules(route_id);
alter table public.patrol_schedules enable row level security;

do $$ begin
  alter table public.patrol_schedules alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

drop policy if exists schedules_read on public.patrol_schedules;
create policy schedules_read on public.patrol_schedules
  for select to authenticated using (
    coalesce(public.is_super_user(), false) or org_id = public.current_org_id()
  );

drop policy if exists schedules_write on public.patrol_schedules;
create policy schedules_write on public.patrol_schedules
  for all to authenticated
  using (
    coalesce(public.is_super_user(), false)
    or (coalesce(public.is_admin(), false) and org_id = public.current_org_id())
    or (coalesce(public.is_manager(), false) and org_id = public.current_org_id())
  )
  with check (
    coalesce(public.is_super_user(), false)
    or (coalesce(public.is_admin(), false) and org_id = public.current_org_id())
    or (coalesce(public.is_manager(), false) and org_id = public.current_org_id())
  );

-- ----------------------------------------------------------------------------
-- expected_patrols — one row per expected run; created by patrol-watcher cron.
-- Marked completed when a real patrol covers it; otherwise late_alert sent.
-- ----------------------------------------------------------------------------
create table if not exists public.expected_patrols (
  id            bigint generated always as identity primary key,
  org_id        uuid,
  schedule_id   uuid references public.patrol_schedules(id) on delete cascade,
  route_id      uuid references public.patrol_routes(id) on delete set null,
  site_id       uuid references public.sites(id) on delete set null,
  due_at        timestamptz not null,
  satisfied_by_patrol_id bigint references public.patrols(id) on delete set null,
  satisfied_at  timestamptz,
  late_alert_sent_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_expected_due on public.expected_patrols(due_at);
create index if not exists idx_expected_open on public.expected_patrols(due_at) where satisfied_at is null;
alter table public.expected_patrols enable row level security;

do $$ begin
  alter table public.expected_patrols alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

drop policy if exists expected_read on public.expected_patrols;
create policy expected_read on public.expected_patrols
  for select to authenticated using (
    coalesce(public.is_super_user(), false) or org_id = public.current_org_id()
  );

-- ----------------------------------------------------------------------------
-- Helper: generate expected_patrols for the next N hours. Idempotent — we
-- skip slots that already exist.
-- ----------------------------------------------------------------------------
create or replace function public.generate_expected_patrols(_horizon_hours int default 6)
returns int language plpgsql security definer set search_path = '' as $$
declare
  _s record;
  _slot timestamptz;
  _slot_hour int;
  _end timestamptz := now() + make_interval(hours => _horizon_hours);
  _created int := 0;
begin
  for _s in
    select id, route_id, site_id, interval_minutes, start_hour, end_hour, org_id
      from public.patrol_schedules where is_active = true
  loop
    -- start from the next interval boundary >= now
    _slot := date_trunc('minute', now())
      + make_interval(mins => (_s.interval_minutes - extract(epoch from (now() - date_trunc('hour', now())))::int / 60 % _s.interval_minutes));
    if _slot < now() then _slot := _slot + make_interval(mins => _s.interval_minutes); end if;

    while _slot < _end loop
      _slot_hour := extract(hour from _slot at time zone 'Africa/Johannesburg');
      if _slot_hour >= _s.start_hour and _slot_hour < _s.end_hour then
        insert into public.expected_patrols (org_id, schedule_id, route_id, site_id, due_at)
        values (_s.org_id, _s.id, _s.route_id, _s.site_id, _slot)
        on conflict do nothing;
        if found then _created := _created + 1; end if;
      end if;
      _slot := _slot + make_interval(mins => _s.interval_minutes);
    end loop;
  end loop;
  return _created;
end $$;

-- ----------------------------------------------------------------------------
-- Mark expected_patrols satisfied when a matching patrol starts.
-- ----------------------------------------------------------------------------
create or replace function public.maybe_satisfy_expected_patrol()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.route_id is not null then
    update public.expected_patrols
       set satisfied_by_patrol_id = new.id, satisfied_at = now()
     where satisfied_at is null
       and route_id = new.route_id
       and due_at between new.started_at - interval '30 minutes' and new.started_at + interval '30 minutes';
  end if;
  return new;
end $$;

drop trigger if exists trg_patrol_satisfies on public.patrols;
create trigger trg_patrol_satisfies
  after insert on public.patrols
  for each row execute function public.maybe_satisfy_expected_patrol();


-- >>> migrations/20260603000011_guard_locations.sql
-- ============================================================================
-- DigiLog 360 — Live guard locations (last reported lat/lng per guard).
-- We only keep "latest" + a 24h breadcrumb trail; older points expire.
-- ============================================================================

create table if not exists public.guard_positions (
  id            bigint generated always as identity primary key,
  org_id        uuid,
  guard_id      uuid not null references public.profiles(id) on delete cascade,
  guard_name    text,
  site_id       uuid references public.sites(id) on delete set null,
  latitude      double precision not null,
  longitude     double precision not null,
  accuracy_m    double precision,
  heading       double precision,
  speed_mps     double precision,
  on_patrol     boolean not null default false,
  recorded_at   timestamptz not null default now()
);
create index if not exists idx_positions_recent on public.guard_positions(recorded_at desc);
create index if not exists idx_positions_guard_recent on public.guard_positions(guard_id, recorded_at desc);
alter table public.guard_positions enable row level security;

do $$ begin
  alter table public.guard_positions alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

-- Guard can only insert their own position; reviewers see all in their org.
drop policy if exists positions_insert on public.guard_positions;
create policy positions_insert on public.guard_positions
  for insert to authenticated with check (guard_id = auth.uid());

drop policy if exists positions_read on public.guard_positions;
create policy positions_read on public.guard_positions
  for select to authenticated using (
    guard_id = auth.uid()
    or coalesce(public.is_super_user(), false)
    or (
      org_id = public.current_org_id()
      and coalesce(public.has_any_role(array['admin','manager','control_room','supervisor']::public.app_role[]), false)
    )
  );

-- Latest position per guard (materialised view? keep it simple with a view).
drop view if exists public.guard_positions_latest cascade;
create view public.guard_positions_latest
  with (security_invoker = on) as
select distinct on (guard_id)
  guard_id, guard_name, org_id, site_id, latitude, longitude, accuracy_m,
  heading, speed_mps, on_patrol, recorded_at
from public.guard_positions
order by guard_id, recorded_at desc;
grant select on public.guard_positions_latest to authenticated;

-- Add a 24h pruner — we don't need historical breadcrumbs beyond a day.
create or replace function public.prune_guard_positions()
returns void language sql security definer set search_path = '' as $$
  delete from public.guard_positions where recorded_at < now() - interval '24 hours';
$$;


-- >>> migrations/20260603000012_voice_and_ocr.sql
-- ============================================================================
-- DigiLog 360 — Voice notes + OCR artefacts
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Storage bucket for voice notes (private). Path: <org_slug>/<OB>/<uuid>.m4a
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'occurrence-voice-notes',
  'occurrence-voice-notes',
  false,
  10485760, -- 10 MB
  array['audio/mp4','audio/m4a','audio/aac','audio/webm','audio/ogg','audio/mpeg']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists voice_read on storage.objects;
create policy voice_read on storage.objects
  for select to authenticated using (
    bucket_id = 'occurrence-voice-notes'
    and (
      coalesce(public.is_super_user(), false)
      or public.storage_path_org_slug(name) = public.current_org_slug()
    )
  );

drop policy if exists voice_insert on storage.objects;
create policy voice_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'occurrence-voice-notes'
    and owner = auth.uid()
    and (
      coalesce(public.is_super_user(), false)
      or public.storage_path_org_slug(name) = public.current_org_slug()
    )
  );

drop policy if exists voice_delete on storage.objects;
create policy voice_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'occurrence-voice-notes'
    and (
      coalesce(public.is_super_user(), false)
      or owner = auth.uid()
      or coalesce(public.is_admin(), false)
    )
  );


-- >>> migrations/20260603000013_multi_role_profiles.sql
-- ============================================================================
-- DigiLog 360 — Multi-role profiles
--   A profile can now hold any subset of app_role values via profiles.roles[].
--   profiles.role is preserved as the "primary" role (always = roles[1]) so
--   that every existing query / display path keeps working without changes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. roles[] column + backfill
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists roles public.app_role[] not null
    default array[]::public.app_role[];

update public.profiles
   set roles = array[role]::public.app_role[]
 where (roles is null or coalesce(array_length(roles, 1), 0) = 0)
   and role is not null;

create index if not exists idx_profiles_roles_gin on public.profiles using gin (roles);

-- ----------------------------------------------------------------------------
-- 2. Sync trigger: roles[1] is the canonical primary. Whenever roles or role
--    changes, we make sure both columns agree.
-- ----------------------------------------------------------------------------
create or replace function public.sync_primary_role()
returns trigger language plpgsql as $$
begin
  if new.roles is not null and coalesce(array_length(new.roles, 1), 0) > 0 then
    -- primary always = roles[1]; ensure the named role is included in the set
    if new.role is null then
      new.role := new.roles[1];
    elsif not (new.role = any(new.roles)) then
      new.roles := array_prepend(new.role, new.roles);
    elsif new.role is distinct from new.roles[1] then
      -- caller changed primary but left it inside the set → re-order so
      -- primary is first.
      new.roles := array_prepend(new.role,
        array(select unnest(new.roles) except select new.role));
    end if;
  elsif new.role is not null then
    new.roles := array[new.role]::public.app_role[];
  end if;
  return new;
end $$;

drop trigger if exists trg_profile_sync_roles on public.profiles;
create trigger trg_profile_sync_roles
  before insert or update on public.profiles
  for each row execute function public.sync_primary_role();

-- ----------------------------------------------------------------------------
-- 3. RLS helper rewrite
-- ----------------------------------------------------------------------------
create or replace function public.current_app_roles()
returns public.app_role[]
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case when coalesce(array_length(roles, 1), 0) > 0
         then roles
         else array[role]::public.app_role[]
    end,
    array[]::public.app_role[]
  )
  from public.profiles where id = auth.uid();
$$;

-- Keep current_app_role() — it now returns the primary role.
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = '' as $$
  select (public.current_app_roles())[1];
$$;

create or replace function public.has_any_role(_roles public.app_role[])
returns boolean language sql stable as $$
  select coalesce(public.current_app_roles() && _roles, false);
$$;

create or replace function public.is_super_user()
returns boolean language sql stable as $$
  select public.has_any_role(array['super_user']::public.app_role[]);
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.has_any_role(array['admin','super_user']::public.app_role[]);
$$;

create or replace function public.is_manager()
returns boolean language sql stable as $$
  select public.has_any_role(array['manager','admin','super_user']::public.app_role[]);
$$;

-- ----------------------------------------------------------------------------
-- 4. Privilege escalation guard: extend the existing check to cover roles[].
-- ----------------------------------------------------------------------------
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _added public.app_role[];
begin
  -- Compute what's NEW in roles (set difference).
  _added := array(select unnest(coalesce(new.roles, array[]::public.app_role[]))
                  except
                  select unnest(coalesce(old.roles, array[]::public.app_role[])));

  -- Block granting super_user unless the caller is super_user.
  if 'super_user' = any(_added) and not public.is_super_user() then
    raise exception 'Only the super user may grant the super_user role.';
  end if;

  -- Org admins may change roles within their org; non-admins cannot.
  if (new.roles is distinct from old.roles)
     or (new.role is distinct from old.role)
     or (new.site_id is distinct from old.site_id)
     or (new.org_id  is distinct from old.org_id) then
    if not (public.is_admin() or auth.uid() is null) then
      raise exception 'Only administrators may change role, site or organization.';
    end if;
    if (new.org_id is distinct from old.org_id) and not public.is_super_user() then
      raise exception 'Only the super user may reassign a user to a different organization.';
    end if;
  end if;

  return new;
end $$;

-- Trigger already attached in earlier migration; no re-create needed.

-- ----------------------------------------------------------------------------
-- 5. handle_new_user: pick up `roles` array from signup metadata too.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _role  public.app_role;
  _roles public.app_role[];
  _site  uuid;
  _org   uuid;
  _emp   text;
begin
  -- Try roles[] first, fall back to single role.
  begin
    _roles := array(
      select x::public.app_role
        from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'roles', '[]'::jsonb)) x
    );
  exception when others then _roles := array[]::public.app_role[]; end;

  begin _role := (new.raw_user_meta_data ->> 'role')::public.app_role;
  exception when others then _role := null; end;

  if coalesce(array_length(_roles, 1), 0) = 0 then
    _roles := array[coalesce(_role, 'guard')]::public.app_role[];
  end if;
  if _role is null then _role := _roles[1]; end if;

  begin _site := nullif(new.raw_user_meta_data ->> 'site_id', '')::uuid;
  exception when others then _site := null; end;

  begin _org  := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;
  exception when others then _org  := null; end;

  _emp := nullif(new.raw_user_meta_data ->> 'employee_number', '');

  if _org is null then
    select id into _org from public.organizations where slug = 'pmi' limit 1;
  end if;

  insert into public.profiles (
    id, email, full_name, role, roles, site_id, org_id, employee_number
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    _role,
    _roles,
    _site,
    _org,
    _emp
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- >>> migrations/20260603000014_capability_registry.sql
-- ============================================================================
-- DigiLog 360 — Capability registry
--
-- Two new tables:
--   • public.capabilities       — catalog of every feature key in the system
--   • public.role_capabilities  — per-org grants of (role → capability)
--
-- Layered model:
--   The app_role enum + RLS policies remain the security floor (RLS still
--   blocks cross-tenant reads, super_user is still the only enum value that
--   bypasses org_id checks, etc).
--   On top of that, capabilities decide which features show up for each role
--   *within* what their RLS already allows. Super user can grant or revoke
--   capabilities per role per org via the /super/permissions UI.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. capabilities catalog (system-wide; super_user manages)
-- ----------------------------------------------------------------------------
create table if not exists public.capabilities (
  key         text primary key,
  area        text not null,
  label       text not null,
  description text,
  is_system   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.capabilities enable row level security;

-- Everyone authenticated can READ the catalog (so the UI can display labels).
drop policy if exists capabilities_read on public.capabilities;
create policy capabilities_read on public.capabilities
  for select to authenticated using (true);

drop policy if exists capabilities_write on public.capabilities;
create policy capabilities_write on public.capabilities
  for all to authenticated
  using (public.is_super_user())
  with check (public.is_super_user());

-- ----------------------------------------------------------------------------
-- 2. role_capabilities — per-org grants
--    One row per (org, role, capability) means that role currently has that
--    capability in that org. Removing the row revokes it.
-- ----------------------------------------------------------------------------
create table if not exists public.role_capabilities (
  org_id          uuid not null references public.organizations(id) on delete cascade,
  role            public.app_role not null,
  capability_key  text not null references public.capabilities(key) on delete cascade,
  granted_at      timestamptz not null default now(),
  granted_by      uuid references public.profiles(id) on delete set null,
  primary key (org_id, role, capability_key)
);

create index if not exists idx_role_caps_org_role
  on public.role_capabilities (org_id, role);

alter table public.role_capabilities enable row level security;

drop policy if exists role_caps_read on public.role_capabilities;
create policy role_caps_read on public.role_capabilities
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

-- Only super_user can change grants (this is the whole point of the feature).
drop policy if exists role_caps_write on public.role_capabilities;
create policy role_caps_write on public.role_capabilities
  for all to authenticated
  using (public.is_super_user())
  with check (public.is_super_user());

-- ----------------------------------------------------------------------------
-- 3. Seed every built-in capability key
-- ----------------------------------------------------------------------------
insert into public.capabilities (key, area, label, description) values
  -- Dashboard
  ('dashboard.view',              'Dashboard',     'View dashboard',                 'KPI charts, SLA stats, top sites'),
  ('dashboard.cross_org',         'Dashboard',     'Cross-org dashboard',            'Aggregate across every tenant'),
  -- Occurrences
  ('occurrences.view_all',        'Occurrences',   'View all occurrences',            null),
  ('occurrences.view_assigned',   'Occurrences',   'View occurrences assigned to me', null),
  ('occurrences.log',             'Occurrences',   'Log a new occurrence',            null),
  ('occurrences.update_status',   'Occurrences',   'Update occurrence status',        null),
  ('occurrences.assign',          'Occurrences',   'Assign occurrences to others',    null),
  ('occurrences.delete',          'Occurrences',   'Soft-delete occurrences',         null),
  ('occurrences.bulk_actions',    'Occurrences',   'Bulk close / acknowledge / assign', null),
  ('occurrences.comment',         'Occurrences',   'Post comments',                   null),
  ('occurrences.export_csv',      'Occurrences',   'Export to CSV',                   null),
  -- Reports
  ('reports.view',                'Reports',       'View occurrence reports',         null),
  ('reports.create',              'Reports',       'Create / edit occurrence reports', null),
  ('reports.export_pdf',          'Reports',       'Export reports as PDF',           null),
  -- Manager workflow
  ('manager.acknowledge',         'Manager',       'Acknowledge occurrences',         null),
  ('manager.escalate',            'Manager',       'Escalate occurrences',            null),
  ('manager.reviewed_logs',       'Manager',       'See reviewed log history',        null),
  -- Patrols + checkpoints
  ('patrols.view',                'Patrols',       'View patrols',                    null),
  ('patrols.run',                 'Patrols',       'Run patrols on mobile',           null),
  ('patrols.end_remote',          'Patrols',       'End someone else''s patrol',      null),
  ('patrols.schedule_manage',     'Patrols',       'Configure patrol schedules',      null),
  ('checkpoints.manage',          'Patrols',       'Create / edit checkpoints',       null),
  -- Field ops
  ('team.view',                   'Field ops',     'View team status',                null),
  ('visitors.manage',             'Field ops',     'Visitor log',                     null),
  ('keys.manage',                 'Field ops',     'Key register',                    null),
  ('shifts.view_all',             'Field ops',     'View all shifts',                 null),
  ('shifts.clock',                'Field ops',     'Clock self in / out',             null),
  ('guards.map_view',             'Field ops',     'Live guard map',                  null),
  -- User management
  ('users.view',                  'Users',         'List users',                      null),
  ('users.create',                'Users',         'Add users',                       null),
  ('users.edit',                  'Users',         'Edit users',                      null),
  ('users.deactivate',            'Users',         'Deactivate users',                null),
  ('users.reset_pin',             'Users',         'Reset PINs',                      null),
  -- Sites
  ('sites.manage',                'Sites',         'Sites CRUD',                      null),
  -- Org settings
  ('org.edit_branding',           'Settings',      'Edit organisation branding',      null),
  ('org.edit_sla',                'Settings',      'Edit SLA matrix',                 null),
  ('org.edit_types',              'Settings',      'Manage custom occurrence types',  null),
  ('webhooks.manage',             'Settings',      'Manage webhooks',                 null),
  ('api_tokens.manage',           'Settings',      'Manage API tokens',               null),
  ('audit.view',                  'Settings',      'View audit log',                  null),
  -- Personal
  ('notifications.view_own',      'Personal',      'View own notifications',          null),
  ('preferences.manage',          'Personal',      'Edit notification preferences',   null),
  ('security.manage_2fa',         'Personal',      'Enable / disable 2FA',            null),
  -- Super user
  ('super.orgs_manage',           'Super user',    'Manage organisations',            null),
  ('super.users_cross_org',       'Super user',    'Cross-org user list',             null),
  ('super.platform_health',       'Super user',    'Platform health dashboard',       null),
  ('super.permissions_manage',    'Super user',    'Edit role × capability matrix',   'This very feature')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Default role → capability map.
--    Mirrors the current hardcoded behaviour. Stored once as a function so
--    org-creation triggers can re-use it.
-- ----------------------------------------------------------------------------
create or replace function public.default_role_capabilities()
returns table (role public.app_role, capability_key text)
language sql immutable as $$
  select * from (
    values
      -- super_user gets everything (driven by SELECT below)
      -- admin
      ('admin'::public.app_role, 'dashboard.view'),
      ('admin', 'occurrences.view_all'),
      ('admin', 'occurrences.view_assigned'),
      ('admin', 'occurrences.log'),
      ('admin', 'occurrences.update_status'),
      ('admin', 'occurrences.assign'),
      ('admin', 'occurrences.delete'),
      ('admin', 'occurrences.bulk_actions'),
      ('admin', 'occurrences.comment'),
      ('admin', 'occurrences.export_csv'),
      ('admin', 'reports.view'),
      ('admin', 'reports.create'),
      ('admin', 'reports.export_pdf'),
      ('admin', 'manager.acknowledge'),
      ('admin', 'manager.escalate'),
      ('admin', 'manager.reviewed_logs'),
      ('admin', 'patrols.view'),
      ('admin', 'patrols.end_remote'),
      ('admin', 'patrols.schedule_manage'),
      ('admin', 'checkpoints.manage'),
      ('admin', 'team.view'),
      ('admin', 'visitors.manage'),
      ('admin', 'keys.manage'),
      ('admin', 'shifts.view_all'),
      ('admin', 'guards.map_view'),
      ('admin', 'users.view'),
      ('admin', 'users.create'),
      ('admin', 'users.edit'),
      ('admin', 'users.deactivate'),
      ('admin', 'users.reset_pin'),
      ('admin', 'sites.manage'),
      ('admin', 'org.edit_branding'),
      ('admin', 'org.edit_sla'),
      ('admin', 'org.edit_types'),
      ('admin', 'webhooks.manage'),
      ('admin', 'api_tokens.manage'),
      ('admin', 'audit.view'),
      ('admin', 'notifications.view_own'),
      ('admin', 'preferences.manage'),
      ('admin', 'security.manage_2fa'),
      -- manager
      ('manager', 'dashboard.view'),
      ('manager', 'occurrences.view_all'),
      ('manager', 'occurrences.view_assigned'),
      ('manager', 'occurrences.log'),
      ('manager', 'occurrences.update_status'),
      ('manager', 'occurrences.assign'),
      ('manager', 'occurrences.bulk_actions'),
      ('manager', 'occurrences.comment'),
      ('manager', 'occurrences.export_csv'),
      ('manager', 'reports.view'),
      ('manager', 'reports.create'),
      ('manager', 'reports.export_pdf'),
      ('manager', 'manager.acknowledge'),
      ('manager', 'manager.escalate'),
      ('manager', 'manager.reviewed_logs'),
      ('manager', 'patrols.view'),
      ('manager', 'patrols.schedule_manage'),
      ('manager', 'team.view'),
      ('manager', 'visitors.manage'),
      ('manager', 'shifts.view_all'),
      ('manager', 'guards.map_view'),
      ('manager', 'audit.view'),
      ('manager', 'notifications.view_own'),
      ('manager', 'preferences.manage'),
      ('manager', 'security.manage_2fa'),
      -- control_room
      ('control_room', 'dashboard.view'),
      ('control_room', 'occurrences.view_all'),
      ('control_room', 'occurrences.view_assigned'),
      ('control_room', 'occurrences.log'),
      ('control_room', 'occurrences.update_status'),
      ('control_room', 'occurrences.comment'),
      ('control_room', 'occurrences.export_csv'),
      ('control_room', 'reports.view'),
      ('control_room', 'reports.create'),
      ('control_room', 'reports.export_pdf'),
      ('control_room', 'patrols.view'),
      ('control_room', 'patrols.end_remote'),
      ('control_room', 'checkpoints.manage'),
      ('control_room', 'team.view'),
      ('control_room', 'visitors.manage'),
      ('control_room', 'keys.manage'),
      ('control_room', 'shifts.view_all'),
      ('control_room', 'guards.map_view'),
      ('control_room', 'notifications.view_own'),
      ('control_room', 'preferences.manage'),
      ('control_room', 'security.manage_2fa'),
      -- supervisor
      ('supervisor', 'dashboard.view'),
      ('supervisor', 'occurrences.view_all'),
      ('supervisor', 'occurrences.view_assigned'),
      ('supervisor', 'occurrences.log'),
      ('supervisor', 'occurrences.update_status'),
      ('supervisor', 'occurrences.comment'),
      ('supervisor', 'reports.view'),
      ('supervisor', 'reports.create'),
      ('supervisor', 'patrols.view'),
      ('supervisor', 'patrols.run'),
      ('supervisor', 'team.view'),
      ('supervisor', 'visitors.manage'),
      ('supervisor', 'shifts.clock'),
      ('supervisor', 'notifications.view_own'),
      ('supervisor', 'preferences.manage'),
      -- guard
      ('guard', 'occurrences.log'),
      ('guard', 'occurrences.view_assigned'),
      ('guard', 'patrols.run'),
      ('guard', 'shifts.clock'),
      ('guard', 'notifications.view_own'),
      ('guard', 'preferences.manage')
  ) as t(role, capability_key);
$$;

-- ----------------------------------------------------------------------------
-- 5. Seed role_capabilities for every existing org.
--    super_user implicitly has all capabilities — we DON'T seed grants for
--    them because the helper function below short-circuits.
-- ----------------------------------------------------------------------------
do $$
declare _org_id uuid;
begin
  for _org_id in select id from public.organizations loop
    insert into public.role_capabilities (org_id, role, capability_key)
    select _org_id, role, capability_key from public.default_role_capabilities()
    on conflict do nothing;
  end loop;
end $$;

-- New orgs: seed defaults on creation.
create or replace function public.seed_org_default_capabilities()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_capabilities (org_id, role, capability_key)
  select new.id, role, capability_key from public.default_role_capabilities()
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_seed_org_caps on public.organizations;
create trigger trg_seed_org_caps
  after insert on public.organizations
  for each row execute function public.seed_org_default_capabilities();

-- ----------------------------------------------------------------------------
-- 6. Helper: does the calling user have the given capability?
--    Returns true if any of their roles has the cap granted in their org,
--    OR if they're super_user (super_user always has everything).
-- ----------------------------------------------------------------------------
create or replace function public.has_capability(_cap text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when public.is_super_user() then true
    else exists (
      select 1
        from public.role_capabilities rc
       where rc.org_id = public.current_org_id()
         and rc.capability_key = _cap
         and rc.role = any(public.current_app_roles())
    )
  end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Convenience view: capabilities the calling user actually has right now.
-- ----------------------------------------------------------------------------
drop view if exists public.my_capabilities cascade;
create view public.my_capabilities
  with (security_invoker = on) as
select distinct
  c.key,
  c.area,
  c.label,
  c.description
from public.capabilities c
where public.is_super_user()
   or exists (
     select 1 from public.role_capabilities rc
     where rc.org_id = public.current_org_id()
       and rc.capability_key = c.key
       and rc.role = any(public.current_app_roles())
   );
grant select on public.my_capabilities to authenticated;
