-- ============================================================================
-- DigiLog 360 — Per-org form builder config for the Log Occurrence page.
--
-- Stored as a single JSONB blob per organisation. Super-user toggles
-- sections on/off in /super/form-builder. The form reads the config and
-- (a) hides disabled sections and (b) skips their validation so users can
-- still submit when an optional section is turned off.
--
-- Default = empty object → every section visible (opt-out).
-- ============================================================================

alter table public.organizations
  add column if not exists log_form_config jsonb not null default '{}'::jsonb;
