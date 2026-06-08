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
