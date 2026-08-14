-- ============================================================================
-- Digilog360 — Site inspection scheduling
--
-- Three layers:
--   inspection_schedules  the RULE      "Marina inspects Sandton every Monday 09:00"
--   inspection_visits     the INSTANCE  one dated, assigned, checkable-into job
--   (visits carry their own checklist snapshot and findings)
--
-- Visits are MATERIALISED rather than computed on read. A recurring rule that
-- only exists as a formula cannot be assigned, checked into, marked missed, or
-- reported on — and "which inspections were skipped last month" is exactly the
-- question this system exists to answer. generate_inspection_visits() rolls the
-- horizon forward and is idempotent, so it is safe to run repeatedly.
--
-- One visit is created PER ASSIGNEE per slot. If two people must inspect a
-- site, each has their own row to check into, and accountability stays with
-- the individual rather than dissolving into a shared task.
-- ============================================================================

-- ─── Sites need coordinates before anyone can check in against them ─────────
-- Mirrors the geofence shape already used by checkpoints.
alter table public.sites add column if not exists latitude          numeric(10,7);
alter table public.sites add column if not exists longitude         numeric(10,7);
alter table public.sites add column if not exists geofence_radius_m integer not null default 250;

-- ─── The recurring rule ─────────────────────────────────────────────────────

create table if not exists public.inspection_schedules (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid,
  site_id        uuid not null references public.sites(id) on delete cascade,
  title          text not null,
  instructions   text,

  -- Everyone who must carry out this inspection. One visit each, per slot.
  assignee_ids   uuid[] not null default '{}',

  frequency      text not null check (frequency in ('daily','weekly','monthly')),
  -- "every N days / weeks / months"
  interval_n     integer not null default 1 check (interval_n between 1 and 12),
  -- weekly only: 0=Sunday … 6=Saturday
  days_of_week   smallint[] not null default '{}',
  -- monthly only
  day_of_month   smallint check (day_of_month between 1 and 31),

  due_time       time not null default '09:00',
  -- How long after due_at the visit may still be completed before it counts
  -- as missed.
  window_minutes integer not null default 240 check (window_minutes between 15 and 10080),

  -- Template the visit copies at generation time, so editing a rule never
  -- rewrites the checklist of an inspection already carried out.
  checklist      jsonb not null default '[]'::jsonb,

  starts_on      date not null default current_date,
  ends_on        date,
  is_active      boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $$ begin
  alter table public.inspection_schedules alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

create index if not exists idx_insp_sched_site on public.inspection_schedules(site_id) where is_active;
create index if not exists idx_insp_sched_org  on public.inspection_schedules(org_id);

-- ─── The dated instance ─────────────────────────────────────────────────────

create table if not exists public.inspection_visits (
  id             uuid primary key default extensions.gen_random_uuid(),
  org_id         uuid,
  -- Null for a one-off inspection created by hand rather than by a rule.
  schedule_id    uuid references public.inspection_schedules(id) on delete cascade,
  site_id        uuid not null references public.sites(id) on delete cascade,
  assigned_to    uuid references public.profiles(id) on delete set null,
  title          text not null,
  instructions   text,

  due_at         timestamptz not null,
  window_end     timestamptz not null,

  status         text not null default 'scheduled'
                 check (status in ('scheduled','checked_in','completed','missed','cancelled')),

  -- Proof of presence. Recorded server-side: the timestamp is the server's,
  -- never the device's, and the distance is computed here rather than trusted
  -- from the client.
  check_in_at        timestamptz,
  check_in_lat       numeric(10,7),
  check_in_lng       numeric(10,7),
  check_in_accuracy_m numeric(8,2),
  check_in_distance_m numeric(10,2),
  -- Whether the fix fell inside the site's geofence. Recorded either way —
  -- an out-of-range check-in is evidence, not something to silently reject.
  check_in_within_geofence boolean,

  completed_at   timestamptz,
  -- Snapshot of the template plus the answers given.
  checklist      jsonb not null default '[]'::jsonb,
  findings       text,
  outcome        text check (outcome in ('pass','issues','fail')),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $$ begin
  alter table public.inspection_visits alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

-- Idempotent generation hinges on this: one visit per rule, per slot, per person.
create unique index if not exists idx_insp_visit_unique
  on public.inspection_visits(schedule_id, assigned_to, due_at)
  where schedule_id is not null;

create index if not exists idx_insp_visit_due    on public.inspection_visits(org_id, due_at desc);
create index if not exists idx_insp_visit_mine   on public.inspection_visits(assigned_to, due_at desc);
create index if not exists idx_insp_visit_site   on public.inspection_visits(site_id, due_at desc);
create index if not exists idx_insp_visit_status on public.inspection_visits(status) where status = 'scheduled';

-- ─── Distance helper (haversine, metres) ────────────────────────────────────
-- Kept in SQL so the check-in path has a single source of truth for "how far
-- away were they", used by both the edge function and any later reporting.
create or replace function public.geo_distance_m(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language sql immutable parallel safe as $$
  select round((
    6371000 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2) - radians(lng1))
        + sin(radians(lat1)) * sin(radians(lat2))
      ))
    )
  )::numeric, 2);
$$;

-- ─── Generation ─────────────────────────────────────────────────────────────

create or replace function public.generate_inspection_visits(horizon_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  made integer := 0;
begin
  with slots as (
    select
      s.id  as schedule_id,
      s.org_id,
      s.site_id,
      s.title,
      s.instructions,
      s.checklist,
      s.window_minutes,
      assignee.id as assigned_to,
      -- Build the timestamp in the SITE's timezone, so "09:00" means nine in
      -- the morning where the guard actually is.
      ((g.gen_day::date + s.due_time) at time zone coalesce(si.timezone, 'Africa/Johannesburg')) as due_at
    from public.inspection_schedules s
    join public.sites si on si.id = s.site_id
    cross join lateral unnest(s.assignee_ids) as assignee(id)
    cross join lateral generate_series(
      greatest(s.starts_on, current_date)::date,
      least(coalesce(s.ends_on, current_date + horizon_days), current_date + horizon_days)::date,
      interval '1 day'
    ) as g(gen_day)
    where s.is_active
      and cardinality(s.assignee_ids) > 0
      and case s.frequency
            when 'daily'  then ((g.gen_day::date - s.starts_on) % s.interval_n) = 0
            when 'weekly' then extract(dow from g.gen_day)::smallint = any(s.days_of_week)
                            and ((floor((g.gen_day::date - s.starts_on) / 7.0)::int) % s.interval_n) = 0
            when 'monthly' then extract(day from g.gen_day)::smallint = s.day_of_month
                            and (( (extract(year from g.gen_day)::int * 12 + extract(month from g.gen_day)::int)
                                 - (extract(year from s.starts_on)::int * 12 + extract(month from s.starts_on)::int)
                                 ) % s.interval_n) = 0
            else false
          end
  )
  insert into public.inspection_visits
    (org_id, schedule_id, site_id, assigned_to, title, instructions, due_at, window_end, checklist)
  select
    slots.org_id, slots.schedule_id, slots.site_id, slots.assigned_to,
    slots.title, slots.instructions, slots.due_at,
    slots.due_at + make_interval(mins => slots.window_minutes),
    slots.checklist
  from slots
  -- Never backfill: a visit whose window already closed could only ever be
  -- created as "missed", which would be inventing history.
  where slots.due_at >= now() - interval '1 day'
  on conflict (schedule_id, assigned_to, due_at) where schedule_id is not null
  do nothing;

  get diagnostics made = row_count;
  return made;
end;
$$;

-- Anything still 'scheduled' after its window closed was not done.
create or replace function public.mark_missed_inspections()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.inspection_visits
     set status = 'missed', updated_at = now()
   where status = 'scheduled'
     and window_end < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.inspection_schedules enable row level security;
alter table public.inspection_visits    enable row level security;

-- Rules: everyone in the org can see what is scheduled; only managers set them.
drop policy if exists insp_sched_read on public.inspection_schedules;
create policy insp_sched_read on public.inspection_schedules
  for select to authenticated
  using (public.is_super_user() or org_id = public.current_org_id());

drop policy if exists insp_sched_write on public.inspection_schedules;
create policy insp_sched_write on public.inspection_schedules
  for all to authenticated
  using (public.is_super_user() or (public.is_manager() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_manager() and org_id = public.current_org_id()));

-- Visits: your own, or anyone's if you supervise.
drop policy if exists insp_visit_read on public.inspection_visits;
create policy insp_visit_read on public.inspection_visits
  for select to authenticated
  using (
    public.is_super_user()
    or assigned_to = auth.uid()
    or (public.is_manager() and org_id = public.current_org_id())
  );

-- The assignee may progress their own visit; managers may adjust any.
-- Check-in itself goes through the edge function, which is what stops a
-- device dictating its own timestamp or distance.
drop policy if exists insp_visit_update on public.inspection_visits;
create policy insp_visit_update on public.inspection_visits
  for update to authenticated
  using (
    public.is_super_user()
    or assigned_to = auth.uid()
    or (public.is_manager() and org_id = public.current_org_id())
  );

drop policy if exists insp_visit_insert on public.inspection_visits;
create policy insp_visit_insert on public.inspection_visits
  for insert to authenticated
  with check (public.is_super_user() or (public.is_manager() and org_id = public.current_org_id()));

-- ─── Nightly roll-forward ───────────────────────────────────────────────────
do $$
begin
  perform cron.unschedule('inspection-visit-generation');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule(
    'inspection-visit-generation',
    '15 0 * * *',
    $cron$
      select public.generate_inspection_visits(30);
      select public.mark_missed_inspections();
    $cron$
  );
-- Broad catch on purpose: pg_cron may be absent, or present but not grantable
-- on this plan. Neither should take the migration down — the generator can be
-- driven externally instead.
exception when others then
  raise notice 'pg_cron unavailable (%) — call generate_inspection_visits() from an external scheduler instead', sqlerrm;
end $$;
