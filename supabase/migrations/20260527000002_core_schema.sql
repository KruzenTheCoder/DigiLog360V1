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
