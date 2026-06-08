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
