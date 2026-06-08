-- Extend org_occurrence_types so each custom type is anchored at a specific
-- (category, subcategory) of the incident taxonomy. The cascading pickers on
-- mobile + admin then merge built-in types with org-custom types under the
-- same category+subcategory.
--
-- Both new columns are nullable so existing rows aren't broken; the admin
-- UI enforces non-null on new inserts.

alter table public.org_occurrence_types
  add column if not exists category text,
  add column if not exists subcategory text;

-- Replace the existing (org_id, lower(name)) uniqueness with one that includes
-- the category+subcategory — two different subcategories can legitimately
-- carry the same leaf name (e.g. "Patrol" under multiple buckets).
drop index if exists public.uq_org_occurrence_types_name_ci;

create unique index if not exists uq_org_occurrence_types_full_ci
  on public.org_occurrence_types (
    org_id, coalesce(category, ''), coalesce(subcategory, ''), lower(name)
  );

-- Helpful index for the per-org listing query.
create index if not exists idx_org_occurrence_types_org_cat
  on public.org_occurrence_types (org_id, category, subcategory);
