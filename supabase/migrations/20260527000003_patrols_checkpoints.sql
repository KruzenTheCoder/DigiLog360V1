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
