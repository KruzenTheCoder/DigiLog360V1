-- ============================================================================
-- DigiLog 360 — Per-profile "show in assignment dropdown" toggle.
--
-- Adds profiles.is_assignable. Super-user manages the list via
-- /super/assignees. The Log Occurrence form filters its assignee dropdown
-- to only users whose flag is true (or — if zero users are toggled on —
-- falls back to the full eligible list so the feature is opt-in).
-- ============================================================================

alter table public.profiles
  add column if not exists is_assignable boolean not null default false;

create index if not exists idx_profiles_is_assignable
  on public.profiles (is_assignable)
  where is_assignable = true;
