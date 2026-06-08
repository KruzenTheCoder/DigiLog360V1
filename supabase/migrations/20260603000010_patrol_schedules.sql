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
