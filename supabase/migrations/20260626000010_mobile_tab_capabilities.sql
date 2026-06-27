-- ============================================================================
-- DigiLog 360 — Mobile bottom tab bar capabilities
--   mobile.tab_bar    — master switch (off ⇒ whole bottom bar hidden)
--   mobile.tab.home / .patrol / .log / .logs — per-tab visibility
-- Super-user toggles these in /super/permissions. Default: all granted to
-- guard + supervisor.
-- ============================================================================

insert into public.capabilities (key, area, label, description) values
  ('mobile.tab_bar',   'Mobile', 'Mobile: Bottom tab bar', 'Master switch for the bottom navigation bar. Off = hidden entirely.'),
  ('mobile.tab.home',  'Mobile', 'Mobile tab: Home',       'Home tab in the bottom bar.'),
  ('mobile.tab.patrol','Mobile', 'Mobile tab: Patrol',     'Patrol tab in the bottom bar.'),
  ('mobile.tab.log',   'Mobile', 'Mobile tab: Log',        'Central Log (+) tab in the bottom bar.'),
  ('mobile.tab.logs',  'Mobile', 'Mobile tab: My Logs',    'My Logs tab in the bottom bar.')
on conflict (key) do nothing;

do $$
declare _org_id uuid; _k text;
  _keys text[] := array['mobile.tab_bar','mobile.tab.home','mobile.tab.patrol','mobile.tab.log','mobile.tab.logs'];
begin
  for _org_id in select id from public.organizations loop
    foreach _k in array _keys loop
      insert into public.role_capabilities (org_id, role, capability_key)
        values (_org_id, 'guard', _k), (_org_id, 'supervisor', _k)
      on conflict do nothing;
    end loop;
  end loop;
end $$;
