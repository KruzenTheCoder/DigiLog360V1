-- ============================================================================
-- DigiLog 360 — Per-profile "can log management reports" toggle.
--
-- Until now the "Management Reports" option on the Log Occurrence form was
-- gated purely by the role capability `occurrences.log_management_report`
-- (granted per role via /super/permissions). This adds a per-USER override so
-- super-user can hand the dropdown to specific individuals without granting it
-- to their whole role.
--
-- Resolution is additive: a user sees the option if their ROLE has the
-- capability OR their personal flag is true. Mirrors the profiles.is_assignable
-- allow-list pattern used by /super/assignees.
-- ============================================================================

alter table public.profiles
  add column if not exists can_log_management_report boolean not null default false;

create index if not exists idx_profiles_can_log_management_report
  on public.profiles (can_log_management_report)
  where can_log_management_report = true;
