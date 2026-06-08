-- Incident classification taxonomy — add category + subcategory columns to
-- occurrences. The existing `occurrence_type` column stays (it's the leaf —
-- the specific incident type like "Armed Robbery"). The triple is what fully
-- classifies an occurrence.
--
-- Both columns are nullable so the 4110 existing rows aren't broken; the
-- mobile and admin UIs require them for new submissions only.

alter table public.occurrences
  add column if not exists category text,
  add column if not exists subcategory text;

create index if not exists idx_occurrences_category
  on public.occurrences (org_id, category);
create index if not exists idx_occurrences_subcategory
  on public.occurrences (org_id, subcategory);
