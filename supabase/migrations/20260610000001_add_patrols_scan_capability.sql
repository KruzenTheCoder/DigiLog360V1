-- ----------------------------------------------------------------------------
-- Add a dedicated "Scan checkpoints" capability (patrols.scan) so the mobile
-- Scan module can be enabled/disabled per role from the permissions matrix,
-- just like every other module. Granted by default to the field roles that
-- scan in the field (guard, supervisor).
-- ----------------------------------------------------------------------------

-- 1. Register the capability in the catalog so it appears in the matrix.
insert into public.capabilities (key, area, label, description, is_system)
values (
  'patrols.scan', 'Patrols', 'Scan checkpoints',
  'Scan checkpoint QR / NFC tags from the mobile app', true
)
on conflict (key) do nothing;

-- 2. Backfill the grant for every existing organisation's field roles.
insert into public.role_capabilities (org_id, role, capability_key)
select o.id, r.role, 'patrols.scan'
  from public.organizations o
  cross join (values
    ('guard'::public.app_role),
    ('supervisor'::public.app_role)
  ) as r(role)
on conflict do nothing;

-- 3. Ensure newly-created organisations also receive it. The original registry
--    seed predates this capability, so extend the per-org seed trigger rather
--    than rewriting the large default_role_capabilities() list.
create or replace function public.seed_org_default_capabilities()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_capabilities (org_id, role, capability_key)
  select new.id, role, capability_key from public.default_role_capabilities()
  on conflict do nothing;
  insert into public.role_capabilities (org_id, role, capability_key)
  values
    (new.id, 'guard'::public.app_role, 'patrols.scan'),
    (new.id, 'supervisor'::public.app_role, 'patrols.scan')
  on conflict do nothing;
  return new;
end $$;
