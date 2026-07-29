-- ============================================================================
-- DigiLog 360 — "Scan from gallery" capability for the visitor sign-in scanner
--
-- The visitor scanner captures a still and decodes the PDF417 from it. On a
-- dense SA licence barcode a live capture can fail on focus, glare or a
-- laminated sleeve, so guards can instead pick an existing full-resolution
-- photo and decode that.
--
-- Some sites will not want a guard able to sign a visitor in from a stored
-- photo (it weakens the "person was physically here" assumption), so this is
-- gated behind its own capability that the super-user can switch off per org
-- and per role, both in /super/mobile-layout and in the /super/permissions
-- matrix.
-- ============================================================================

insert into public.capabilities (key, area, label, description) values
  (
    'mobile.visitors.gallery_pick',
    'Mobile',
    'Mobile: Scan licence from gallery',
    'Lets the visitor sign-in scanner pick an existing photo instead of using the live camera.'
  )
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Default grants — ON for guard + supervisor in every org, matching how the
-- other mobile container capabilities are seeded. Sites that don't want it can
-- switch it off from the super-user console.
-- ----------------------------------------------------------------------------
do $$
declare
  _org_id uuid;
begin
  for _org_id in select id from public.organizations loop
    insert into public.role_capabilities (org_id, role, capability_key)
      values
        (_org_id, 'guard',      'mobile.visitors.gallery_pick'),
        (_org_id, 'supervisor', 'mobile.visitors.gallery_pick')
    on conflict do nothing;
  end loop;
end $$;
