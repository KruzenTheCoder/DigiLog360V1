-- DigiLog 360 — Audit log visibility by capability
--
-- Users who hold the `audit.view` capability should see the full audit trail
-- for their current organisation, not just super users / admins.

drop policy if exists audit_select on public.audit_log;

create policy audit_select on public.audit_log
  for select to authenticated using (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_capability('audit.view')
    )
  );
