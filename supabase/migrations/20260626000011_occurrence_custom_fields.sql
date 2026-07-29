-- ============================================================================
-- DigiLog 360 — Custom-field bag on occurrences.
--
-- The form builder lets super-users define arbitrary sections + fields on
-- the Log Occurrence page. Answers are persisted in this jsonb column
-- keyed by `${sectionId}.${fieldKey}` → value.
-- ============================================================================

alter table public.occurrences
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create index if not exists idx_occurrences_custom_fields
  on public.occurrences using gin (custom_fields);
