-- ============================================================================
-- DigiLog 360 — Seed the per-user "Management Reports" flag from current access.
--
-- The Management Reports dropdown is now controlled ONLY by
-- profiles.can_log_management_report (see the new/page.tsx gating), so the
-- /super/management-reports toggle is the single source of truth. To avoid
-- anyone losing the option on rollout, turn the flag ON for everyone who has
-- effective access today:
--   • any super_user (they implicitly had every capability), and
--   • anyone whose role currently holds the
--     `occurrences.log_management_report` capability in their org.
--
-- Idempotent: only ever sets the flag to true, so it's safe to re-run.
-- ============================================================================

update public.profiles p
   set can_log_management_report = true
 where p.can_log_management_report is distinct from true
   and (
     'super_user' = any(p.roles)
     or exists (
       select 1
         from public.role_capabilities rc
        where rc.org_id = p.org_id
          and rc.capability_key = 'occurrences.log_management_report'
          and rc.role = any(p.roles)
     )
   );
