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
