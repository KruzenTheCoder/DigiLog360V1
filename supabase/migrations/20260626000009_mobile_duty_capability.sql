-- ============================================================================
-- DigiLog 360 — Mobile "Duty" container capability
-- Gates the on/off-patrol toggle card on the mobile Guard Portal home.
-- ============================================================================

insert into public.capabilities (key, area, label, description) values
  ('mobile.home.duty', 'Mobile', 'Mobile: Duty card', 'On/off patrol toggle portal card.')
on conflict (key) do nothing;

do $$
declare _org_id uuid;
begin
  for _org_id in select id from public.organizations loop
    insert into public.role_capabilities (org_id, role, capability_key)
      values (_org_id, 'guard', 'mobile.home.duty'), (_org_id, 'supervisor', 'mobile.home.duty')
    on conflict do nothing;
  end loop;
end $$;
