-- DigiLog 360 — occurrence report field: all areas secure
--
-- Stores whether the site / affected areas were confirmed secure when the
-- report was completed.

alter table public.occurrence_reports
  add column if not exists all_areas_secure boolean;
