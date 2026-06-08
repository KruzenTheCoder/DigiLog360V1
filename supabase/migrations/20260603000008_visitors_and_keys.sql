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
