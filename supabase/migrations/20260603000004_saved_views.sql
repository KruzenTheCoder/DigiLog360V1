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
