-- ============================================================================
-- DigiLog 360 — Capability registry
--
-- Two new tables:
--   • public.capabilities       — catalog of every feature key in the system
--   • public.role_capabilities  — per-org grants of (role → capability)
--
-- Layered model:
--   The app_role enum + RLS policies remain the security floor (RLS still
--   blocks cross-tenant reads, super_user is still the only enum value that
--   bypasses org_id checks, etc).
--   On top of that, capabilities decide which features show up for each role
--   *within* what their RLS already allows. Super user can grant or revoke
--   capabilities per role per org via the /super/permissions UI.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. capabilities catalog (system-wide; super_user manages)
-- ----------------------------------------------------------------------------
create table if not exists public.capabilities (
  key         text primary key,
  area        text not null,
  label       text not null,
  description text,
  is_system   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.capabilities enable row level security;

-- Everyone authenticated can READ the catalog (so the UI can display labels).
drop policy if exists capabilities_read on public.capabilities;
create policy capabilities_read on public.capabilities
  for select to authenticated using (true);

drop policy if exists capabilities_write on public.capabilities;
create policy capabilities_write on public.capabilities
  for all to authenticated
  using (public.is_super_user())
  with check (public.is_super_user());

-- ----------------------------------------------------------------------------
-- 2. role_capabilities — per-org grants
--    One row per (org, role, capability) means that role currently has that
--    capability in that org. Removing the row revokes it.
-- ----------------------------------------------------------------------------
create table if not exists public.role_capabilities (
  org_id          uuid not null references public.organizations(id) on delete cascade,
  role            public.app_role not null,
  capability_key  text not null references public.capabilities(key) on delete cascade,
  granted_at      timestamptz not null default now(),
  granted_by      uuid references public.profiles(id) on delete set null,
  primary key (org_id, role, capability_key)
);

create index if not exists idx_role_caps_org_role
  on public.role_capabilities (org_id, role);

alter table public.role_capabilities enable row level security;

drop policy if exists role_caps_read on public.role_capabilities;
create policy role_caps_read on public.role_capabilities
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

-- Only super_user can change grants (this is the whole point of the feature).
drop policy if exists role_caps_write on public.role_capabilities;
create policy role_caps_write on public.role_capabilities
  for all to authenticated
  using (public.is_super_user())
  with check (public.is_super_user());

-- ----------------------------------------------------------------------------
-- 3. Seed every built-in capability key
-- ----------------------------------------------------------------------------
insert into public.capabilities (key, area, label, description) values
  -- Dashboard
  ('dashboard.view',              'Dashboard',     'View dashboard',                 'KPI charts, SLA stats, top sites'),
  ('dashboard.cross_org',         'Dashboard',     'Cross-org dashboard',            'Aggregate across every tenant'),
  -- Occurrences
  ('occurrences.view_all',        'Occurrences',   'View all occurrences',            null),
  ('occurrences.view_assigned',   'Occurrences',   'View occurrences assigned to me', null),
  ('occurrences.log',             'Occurrences',   'Log a new occurrence',            null),
  ('occurrences.update_status',   'Occurrences',   'Update occurrence status',        null),
  ('occurrences.assign',          'Occurrences',   'Assign occurrences to others',    null),
  ('occurrences.delete',          'Occurrences',   'Soft-delete occurrences',         null),
  ('occurrences.bulk_actions',    'Occurrences',   'Bulk close / acknowledge / assign', null),
  ('occurrences.comment',         'Occurrences',   'Post comments',                   null),
  ('occurrences.export_csv',      'Occurrences',   'Export to CSV',                   null),
  -- Reports
  ('reports.view',                'Reports',       'View occurrence reports',         null),
  ('reports.create',              'Reports',       'Create / edit occurrence reports', null),
  ('reports.export_pdf',          'Reports',       'Export reports as PDF',           null),
  -- Manager workflow
  ('manager.acknowledge',         'Manager',       'Acknowledge occurrences',         null),
  ('manager.escalate',            'Manager',       'Escalate occurrences',            null),
  ('manager.reviewed_logs',       'Manager',       'See reviewed log history',        null),
  -- Patrols + checkpoints
  ('patrols.view',                'Patrols',       'View patrols',                    null),
  ('patrols.run',                 'Patrols',       'Run patrols on mobile',           null),
  ('patrols.end_remote',          'Patrols',       'End someone else''s patrol',      null),
  ('patrols.schedule_manage',     'Patrols',       'Configure patrol schedules',      null),
  ('checkpoints.manage',          'Patrols',       'Create / edit checkpoints',       null),
  -- Field ops
  ('team.view',                   'Field ops',     'View team status',                null),
  ('visitors.manage',             'Field ops',     'Visitor log',                     null),
  ('keys.manage',                 'Field ops',     'Key register',                    null),
  ('shifts.view_all',             'Field ops',     'View all shifts',                 null),
  ('shifts.clock',                'Field ops',     'Clock self in / out',             null),
  ('guards.map_view',             'Field ops',     'Live guard map',                  null),
  -- User management
  ('users.view',                  'Users',         'List users',                      null),
  ('users.create',                'Users',         'Add users',                       null),
  ('users.edit',                  'Users',         'Edit users',                      null),
  ('users.deactivate',            'Users',         'Deactivate users',                null),
  ('users.reset_pin',             'Users',         'Reset PINs',                      null),
  -- Sites
  ('sites.manage',                'Sites',         'Sites CRUD',                      null),
  -- Org settings
  ('org.edit_branding',           'Settings',      'Edit organisation branding',      null),
  ('org.edit_sla',                'Settings',      'Edit SLA matrix',                 null),
  ('org.edit_types',              'Settings',      'Manage custom occurrence types',  null),
  ('webhooks.manage',             'Settings',      'Manage webhooks',                 null),
  ('api_tokens.manage',           'Settings',      'Manage API tokens',               null),
  ('audit.view',                  'Settings',      'View audit log',                  null),
  -- Personal
  ('notifications.view_own',      'Personal',      'View own notifications',          null),
  ('preferences.manage',          'Personal',      'Edit notification preferences',   null),
  ('security.manage_2fa',         'Personal',      'Enable / disable 2FA',            null),
  -- Super user
  ('super.orgs_manage',           'Super user',    'Manage organisations',            null),
  ('super.users_cross_org',       'Super user',    'Cross-org user list',             null),
  ('super.platform_health',       'Super user',    'Platform health dashboard',       null),
  ('super.permissions_manage',    'Super user',    'Edit role × capability matrix',   'This very feature')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Default role → capability map.
--    Mirrors the current hardcoded behaviour. Stored once as a function so
--    org-creation triggers can re-use it.
-- ----------------------------------------------------------------------------
create or replace function public.default_role_capabilities()
returns table (role public.app_role, capability_key text)
language sql immutable as $$
  select * from (
    values
      -- super_user gets everything (driven by SELECT below)
      -- admin
      ('admin'::public.app_role, 'dashboard.view'),
      ('admin', 'occurrences.view_all'),
      ('admin', 'occurrences.view_assigned'),
      ('admin', 'occurrences.log'),
      ('admin', 'occurrences.update_status'),
      ('admin', 'occurrences.assign'),
      ('admin', 'occurrences.delete'),
      ('admin', 'occurrences.bulk_actions'),
      ('admin', 'occurrences.comment'),
      ('admin', 'occurrences.export_csv'),
      ('admin', 'reports.view'),
      ('admin', 'reports.create'),
      ('admin', 'reports.export_pdf'),
      ('admin', 'manager.acknowledge'),
      ('admin', 'manager.escalate'),
      ('admin', 'manager.reviewed_logs'),
      ('admin', 'patrols.view'),
      ('admin', 'patrols.end_remote'),
      ('admin', 'patrols.schedule_manage'),
      ('admin', 'checkpoints.manage'),
      ('admin', 'team.view'),
      ('admin', 'visitors.manage'),
      ('admin', 'keys.manage'),
      ('admin', 'shifts.view_all'),
      ('admin', 'guards.map_view'),
      ('admin', 'users.view'),
      ('admin', 'users.create'),
      ('admin', 'users.edit'),
      ('admin', 'users.deactivate'),
      ('admin', 'users.reset_pin'),
      ('admin', 'sites.manage'),
      ('admin', 'org.edit_branding'),
      ('admin', 'org.edit_sla'),
      ('admin', 'org.edit_types'),
      ('admin', 'webhooks.manage'),
      ('admin', 'api_tokens.manage'),
      ('admin', 'audit.view'),
      ('admin', 'notifications.view_own'),
      ('admin', 'preferences.manage'),
      ('admin', 'security.manage_2fa'),
      -- manager
      ('manager', 'dashboard.view'),
      ('manager', 'occurrences.view_all'),
      ('manager', 'occurrences.view_assigned'),
      ('manager', 'occurrences.log'),
      ('manager', 'occurrences.update_status'),
      ('manager', 'occurrences.assign'),
      ('manager', 'occurrences.bulk_actions'),
      ('manager', 'occurrences.comment'),
      ('manager', 'occurrences.export_csv'),
      ('manager', 'reports.view'),
      ('manager', 'reports.create'),
      ('manager', 'reports.export_pdf'),
      ('manager', 'manager.acknowledge'),
      ('manager', 'manager.escalate'),
      ('manager', 'manager.reviewed_logs'),
      ('manager', 'patrols.view'),
      ('manager', 'patrols.schedule_manage'),
      ('manager', 'team.view'),
      ('manager', 'visitors.manage'),
      ('manager', 'shifts.view_all'),
      ('manager', 'guards.map_view'),
      ('manager', 'audit.view'),
      ('manager', 'notifications.view_own'),
      ('manager', 'preferences.manage'),
      ('manager', 'security.manage_2fa'),
      -- control_room
      ('control_room', 'dashboard.view'),
      ('control_room', 'occurrences.view_all'),
      ('control_room', 'occurrences.view_assigned'),
      ('control_room', 'occurrences.log'),
      ('control_room', 'occurrences.update_status'),
      ('control_room', 'occurrences.comment'),
      ('control_room', 'occurrences.export_csv'),
      ('control_room', 'reports.view'),
      ('control_room', 'reports.create'),
      ('control_room', 'reports.export_pdf'),
      ('control_room', 'patrols.view'),
      ('control_room', 'patrols.end_remote'),
      ('control_room', 'checkpoints.manage'),
      ('control_room', 'team.view'),
      ('control_room', 'visitors.manage'),
      ('control_room', 'keys.manage'),
      ('control_room', 'shifts.view_all'),
      ('control_room', 'guards.map_view'),
      ('control_room', 'notifications.view_own'),
      ('control_room', 'preferences.manage'),
      ('control_room', 'security.manage_2fa'),
      -- supervisor
      ('supervisor', 'dashboard.view'),
      ('supervisor', 'occurrences.view_all'),
      ('supervisor', 'occurrences.view_assigned'),
      ('supervisor', 'occurrences.log'),
      ('supervisor', 'occurrences.update_status'),
      ('supervisor', 'occurrences.comment'),
      ('supervisor', 'reports.view'),
      ('supervisor', 'reports.create'),
      ('supervisor', 'patrols.view'),
      ('supervisor', 'patrols.run'),
      ('supervisor', 'team.view'),
      ('supervisor', 'visitors.manage'),
      ('supervisor', 'shifts.clock'),
      ('supervisor', 'notifications.view_own'),
      ('supervisor', 'preferences.manage'),
      -- guard
      ('guard', 'occurrences.log'),
      ('guard', 'occurrences.view_assigned'),
      ('guard', 'patrols.run'),
      ('guard', 'shifts.clock'),
      ('guard', 'notifications.view_own'),
      ('guard', 'preferences.manage')
  ) as t(role, capability_key);
$$;

-- ----------------------------------------------------------------------------
-- 5. Seed role_capabilities for every existing org.
--    super_user implicitly has all capabilities — we DON'T seed grants for
--    them because the helper function below short-circuits.
-- ----------------------------------------------------------------------------
do $$
declare _org_id uuid;
begin
  for _org_id in select id from public.organizations loop
    insert into public.role_capabilities (org_id, role, capability_key)
    select _org_id, role, capability_key from public.default_role_capabilities()
    on conflict do nothing;
  end loop;
end $$;

-- New orgs: seed defaults on creation.
create or replace function public.seed_org_default_capabilities()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.role_capabilities (org_id, role, capability_key)
  select new.id, role, capability_key from public.default_role_capabilities()
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_seed_org_caps on public.organizations;
create trigger trg_seed_org_caps
  after insert on public.organizations
  for each row execute function public.seed_org_default_capabilities();

-- ----------------------------------------------------------------------------
-- 6. Helper: does the calling user have the given capability?
--    Returns true if any of their roles has the cap granted in their org,
--    OR if they're super_user (super_user always has everything).
-- ----------------------------------------------------------------------------
create or replace function public.has_capability(_cap text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when public.is_super_user() then true
    else exists (
      select 1
        from public.role_capabilities rc
       where rc.org_id = public.current_org_id()
         and rc.capability_key = _cap
         and rc.role = any(public.current_app_roles())
    )
  end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Convenience view: capabilities the calling user actually has right now.
-- ----------------------------------------------------------------------------
drop view if exists public.my_capabilities cascade;
create view public.my_capabilities
  with (security_invoker = on) as
select distinct
  c.key,
  c.area,
  c.label,
  c.description
from public.capabilities c
where public.is_super_user()
   or exists (
     select 1 from public.role_capabilities rc
     where rc.org_id = public.current_org_id()
       and rc.capability_key = c.key
       and rc.role = any(public.current_app_roles())
   );
grant select on public.my_capabilities to authenticated;
