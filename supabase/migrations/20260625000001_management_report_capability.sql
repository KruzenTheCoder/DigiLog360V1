-- ============================================================================
-- DigiLog 360 — "Log Management Report" capability
--
-- Adds an extra capability key that gates a special quick-path on the
-- Log Incident form: an extra sub-category option "Management Reports"
-- which auto-selects the "Reports" specific-type. Only users whose role
-- has this capability granted see the option.
--
-- Default grant: admin + manager. super_user already has everything.
-- ============================================================================

insert into public.capabilities (key, area, label, description) values
  ('occurrences.log_management_report', 'Occurrences',
   'Log management reports',
   'Adds the "Management Reports" shortcut to the Log Incident form (auto-fills type=Reports)')
on conflict (key) do nothing;

-- Grant to admin + manager in every existing org.
insert into public.role_capabilities (org_id, role, capability_key)
select o.id, r.role, 'occurrences.log_management_report'
  from public.organizations o
 cross join (values ('admin'::public.app_role), ('manager'::public.app_role)) as r(role)
on conflict do nothing;
