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
