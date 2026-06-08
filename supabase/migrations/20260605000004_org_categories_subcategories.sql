-- Make the incident taxonomy fully editable per-org. The built-in
-- INCIDENT_TAXONOMY in @digilog/shared remains the default — these tables
-- let an admin ADD to it at any level (category, sub-category, leaf type).
--
-- Categories and sub-categories are stored as strings (no FK between them),
-- mirroring how the built-in taxonomy is shaped. The merge happens in the
-- shared helpers (mergeIncidentCategories, mergeIncidentSubcategories,
-- mergeIncidentTypes) so a single source of truth feeds both UIs.

-- ----- Categories -----
create table if not exists public.org_incident_categories (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists uq_org_incident_categories_ci
  on public.org_incident_categories (org_id, lower(name));

alter table public.org_incident_categories enable row level security;

drop policy if exists incident_categories_select on public.org_incident_categories;
create policy incident_categories_select on public.org_incident_categories
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists incident_categories_write on public.org_incident_categories;
create policy incident_categories_write on public.org_incident_categories
  for all to authenticated
  using (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()));

-- ----- Sub-categories -----
-- Sub-categories reference their parent by category NAME (string), not FK.
-- This lets a sub-category sit under a built-in category as well as an
-- org-custom one — same lookup model used by org_occurrence_types.
create table if not exists public.org_incident_subcategories (
  id          uuid primary key default extensions.gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  category    text not null,
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists uq_org_incident_subcategories_ci
  on public.org_incident_subcategories (org_id, lower(category), lower(name));

create index if not exists idx_org_incident_subcategories_org_cat
  on public.org_incident_subcategories (org_id, category);

alter table public.org_incident_subcategories enable row level security;

drop policy if exists incident_subcategories_select on public.org_incident_subcategories;
create policy incident_subcategories_select on public.org_incident_subcategories
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

drop policy if exists incident_subcategories_write on public.org_incident_subcategories;
create policy incident_subcategories_write on public.org_incident_subcategories
  for all to authenticated
  using (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()));
