-- ============================================================================
-- DigiLog 360 — Mobile home "container" capabilities
--
-- Each card/container on the mobile Guard Portal home is gated by one of these
-- keys, so the super-user can toggle any container on/off per role in the
-- /super/permissions matrix.
--
-- This also FIXES the two pre-existing mobile keys (mobile.kpi_visible,
-- mobile.occurrence_history_visible) which the mobile code referenced but were
-- never seeded into the catalog — meaning can('mobile.kpi_visible') always
-- returned false and the KPI/History containers were permanently hidden.
-- ============================================================================

insert into public.capabilities (key, area, label, description) values
  ('mobile.home.new_occurrence', 'Mobile', 'Mobile: New Occurrence card', 'Big "Log occurrence" portal card on the mobile home.'),
  ('mobile.home.shift',          'Mobile', 'Mobile: Shift Duty card',     'Clock-in / clock-out portal card.'),
  ('mobile.home.patrol',         'Mobile', 'Mobile: Patrol card',         'Start / continue patrol portal card.'),
  ('mobile.home.scan',           'Mobile', 'Mobile: Scan Checkpoint card','QR / NFC checkpoint scan portal card.'),
  ('mobile.home.visitors',       'Mobile', 'Mobile: Visitors card',       'Visitor sign-in/out portal card.'),
  ('mobile.home.keys',           'Mobile', 'Mobile: Keys card',           'Key register portal card.'),
  ('mobile.home.tasks',          'Mobile', 'Mobile: Tasks card',          'My tasks portal card.'),
  ('mobile.home.history',        'Mobile', 'Mobile: History card',        'My logged occurrences history portal card.'),
  ('mobile.home.kpi',            'Mobile', 'Mobile: KPI strip',           'Key-metrics strip on the mobile home.'),
  ('mobile.home.supervisor_board','Mobile','Mobile: Site Board card',     'Supervisor live SLA board portal card.'),
  ('mobile.home.team',           'Mobile', 'Mobile: Team card',           'Supervisor team-on-duty portal card.'),
  -- Keep the legacy keys in the catalog too (referenced by older builds).
  ('mobile.kpi_visible',                'Mobile', 'Mobile: KPI strip (legacy)',     'Legacy alias for mobile.home.kpi.'),
  ('mobile.occurrence_history_visible', 'Mobile', 'Mobile: History (legacy)',       'Legacy alias for mobile.home.history.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Default grants — everything ON for guard + supervisor, plus the supervisor-
-- only containers (board/team) only for supervisor. Mobile is guard/supervisor
-- only, so we don't grant to web roles.
-- ----------------------------------------------------------------------------
do $$
declare
  _org_id uuid;
  _guard_keys text[] := array[
    'mobile.home.new_occurrence','mobile.home.shift','mobile.home.patrol',
    'mobile.home.scan','mobile.home.visitors','mobile.home.keys',
    'mobile.home.tasks','mobile.home.history','mobile.home.kpi',
    'mobile.kpi_visible','mobile.occurrence_history_visible'
  ];
  _supervisor_extra text[] := array[
    'mobile.home.supervisor_board','mobile.home.team'
  ];
  _k text;
begin
  for _org_id in select id from public.organizations loop
    foreach _k in array _guard_keys loop
      insert into public.role_capabilities (org_id, role, capability_key)
        values (_org_id, 'guard', _k), (_org_id, 'supervisor', _k)
      on conflict do nothing;
    end loop;
    foreach _k in array (_guard_keys || _supervisor_extra) loop
      insert into public.role_capabilities (org_id, role, capability_key)
        values (_org_id, 'supervisor', _k)
      on conflict do nothing;
    end loop;
  end loop;
end $$;
