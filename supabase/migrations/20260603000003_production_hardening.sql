-- ============================================================================
-- DigiLog 360 — Production hardening
--   • audit_log              (immutable trail of sensitive actions)
--   • pin_attempts           (PIN brute-force tracking + lockout window)
--   • notifications          (per-user inbox; complements push)
--   • soft delete columns    (deleted_at on profiles/sites/occurrences/orgs)
--   • composite indexes      (org_id, ...) for the queries the apps actually run
--   • storage RLS rewrite    (org-scoped path prefix isolation)
--   • helper fns: log_audit_event, check_pin_lockout, register_pin_attempt
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. audit_log
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  org_id        uuid references public.organizations(id) on delete set null,
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_name    text,
  actor_role    public.app_role,
  action        text not null,                -- e.g. 'user.create','pin.reset','org.suspend','occurrence.delete'
  target_table  text,
  target_id     text,                         -- stringified row id (uuid or bigint)
  summary       text,
  metadata      jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_audit_org_created on public.audit_log(org_id, created_at desc);
create index if not exists idx_audit_actor on public.audit_log(actor_id, created_at desc);
create index if not exists idx_audit_action on public.audit_log(action);
alter table public.audit_log enable row level security;

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated using (
    public.is_super_user()
    or (public.is_admin() and org_id = public.current_org_id())
  );

-- Audit is append-only via the helper function (service_role / SECURITY DEFINER).
-- No insert / update / delete policies for regular users.

-- ----------------------------------------------------------------------------
-- 2. pin_attempts (brute-force tracking)
-- ----------------------------------------------------------------------------
create table if not exists public.pin_attempts (
  id            bigint generated always as identity primary key,
  org_slug      text,
  employee_number text,
  profile_id    uuid references public.profiles(id) on delete cascade,
  success       boolean not null,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_pin_attempts_profile on public.pin_attempts(profile_id, created_at desc);
create index if not exists idx_pin_attempts_emp on public.pin_attempts(lower(employee_number), created_at desc);
alter table public.pin_attempts enable row level security;

-- Only super_user and org admins (own org) can read.
drop policy if exists pin_attempts_select on public.pin_attempts;
create policy pin_attempts_select on public.pin_attempts
  for select to authenticated using (
    public.is_super_user()
    or (
      public.is_admin()
      and exists (
        select 1 from public.profiles p
        where p.id = profile_id and p.org_id = public.current_org_id()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. profiles columns to support PIN lockout cleanly
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists locked_until timestamptz,
  add column if not exists deleted_at  timestamptz;

-- ----------------------------------------------------------------------------
-- 4. notifications (per-user inbox)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  org_id      uuid references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,                  -- 'sla.breach','sla.update_due','occurrence.assigned','manager.ack','system'
  title       text not null,
  body        text,
  data        jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_user_unread on public.notifications(user_id, created_at desc)
  where read_at is null;
create index if not exists idx_notif_user_all on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select to authenticated using (
    user_id = auth.uid()
    or public.is_super_user()
    or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists notif_update_self on public.notifications;
create policy notif_update_self on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notif_delete_self on public.notifications;
create policy notif_delete_self on public.notifications
  for delete to authenticated using (
    user_id = auth.uid() or public.is_super_user()
  );

-- ----------------------------------------------------------------------------
-- 5. Soft-delete columns on the data tables that matter most
-- ----------------------------------------------------------------------------
alter table public.organizations add column if not exists deleted_at timestamptz;
alter table public.sites         add column if not exists deleted_at timestamptz;
alter table public.occurrences   add column if not exists deleted_at timestamptz;

-- Re-publish realtime change for occurrences (no-op if already there).
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Composite indexes that match the apps' real queries
-- ----------------------------------------------------------------------------
create index if not exists idx_occ_org_status on public.occurrences(org_id, status);
create index if not exists idx_occ_org_severity on public.occurrences(org_id, severity);
create index if not exists idx_occ_org_incident_desc on public.occurrences(org_id, incident_at desc);
create index if not exists idx_occ_org_created_desc on public.occurrences(org_id, created_at desc);

create index if not exists idx_patrols_org_status on public.patrols(org_id, status);
create index if not exists idx_patrols_org_started_desc on public.patrols(org_id, started_at desc);

create index if not exists idx_profiles_org_role on public.profiles(org_id, role);
create index if not exists idx_profiles_org_active on public.profiles(org_id, is_active);

create index if not exists idx_reports_org_created_desc on public.occurrence_reports(org_id, created_at desc);
create index if not exists idx_updates_org_created_desc on public.occurrence_updates(org_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 7. RLS: hide soft-deleted rows from non-super_user reads
-- ----------------------------------------------------------------------------
-- Wrap existing policies by re-creating them with `... and deleted_at is null`.
drop policy if exists occurrences_select on public.occurrences;
create policy occurrences_select on public.occurrences
  for select to authenticated using (
    deleted_at is null and (
      public.is_super_user()
      or (
        org_id = public.current_org_id() and (
          public.has_any_role(array['admin','manager','control_room']::public.app_role[])
          or logged_by = auth.uid()
          or site_id = public.current_site_id()
        )
      )
    )
  );

drop policy if exists sites_select on public.sites;
create policy sites_select on public.sites
  for select to authenticated using (
    deleted_at is null and (
      public.is_super_user() or org_id = public.current_org_id()
    )
  );

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    deleted_at is null and (
      public.is_super_user()
      or id = auth.uid()
      or (
        org_id = public.current_org_id()
        and (
          public.has_any_role(array['admin','manager','control_room']::public.app_role[])
          or site_id = public.current_site_id()
        )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 8. STORAGE: org-scoped path isolation for occurrence-images.
--    Convention: occurrence-images/<org_slug>/<OB_NUMBER>/<uuid>.<ext>
-- ----------------------------------------------------------------------------
-- helper: extract the first path segment (org slug) from storage.objects.name
create or replace function public.storage_path_org_slug(_name text)
returns text language sql immutable as $$
  select split_part(_name, '/', 1);
$$;

-- helper: caller's org slug
create or replace function public.current_org_slug()
returns text language sql stable security definer set search_path = '' as $$
  select o.slug
    from public.organizations o
    join public.profiles p on p.org_id = o.id
   where p.id = auth.uid();
$$;

drop policy if exists occ_images_read on storage.objects;
create policy occ_images_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'occurrence-images'
    and (
      public.is_super_user()
      or public.storage_path_org_slug(name) = public.current_org_slug()
    )
  );

drop policy if exists occ_images_insert on storage.objects;
create policy occ_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'occurrence-images'
    and owner = auth.uid()
    and (
      public.is_super_user()
      or public.storage_path_org_slug(name) = public.current_org_slug()
    )
  );

drop policy if exists occ_images_update on storage.objects;
create policy occ_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'occurrence-images'
    and (
      public.is_super_user()
      or (
        public.storage_path_org_slug(name) = public.current_org_slug()
        and (owner = auth.uid() or public.is_admin())
      )
    )
  );

drop policy if exists occ_images_delete on storage.objects;
create policy occ_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'occurrence-images'
    and (
      public.is_super_user()
      or (
        public.storage_path_org_slug(name) = public.current_org_slug()
        and (
          owner = auth.uid()
          or public.has_any_role(array['admin','control_room','supervisor','manager']::public.app_role[])
        )
      )
    )
  );

-- Org branding bucket (logos). Public, write restricted to org admins.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-branding', 'org-branding', true, 2097152,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
) on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists org_branding_read on storage.objects;
create policy org_branding_read on storage.objects
  for select to public using (bucket_id = 'org-branding');

drop policy if exists org_branding_write on storage.objects;
create policy org_branding_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'org-branding'
    and owner = auth.uid()
    and (
      public.is_super_user()
      or (
        public.is_admin()
        and public.storage_path_org_slug(name) = public.current_org_slug()
      )
    )
  );

drop policy if exists org_branding_delete on storage.objects;
create policy org_branding_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'org-branding'
    and (
      public.is_super_user()
      or (
        public.is_admin()
        and public.storage_path_org_slug(name) = public.current_org_slug()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 9. Helper functions used by edge functions.
-- ----------------------------------------------------------------------------

-- Append an immutable audit row. Called from edge functions via service_role,
-- and from a few triggers below.
create or replace function public.log_audit_event(
  _action       text,
  _actor_id     uuid default null,
  _org_id       uuid default null,
  _target_table text default null,
  _target_id    text default null,
  _summary      text default null,
  _metadata     jsonb default null,
  _ip           inet default null,
  _user_agent   text default null
) returns bigint
language plpgsql
security definer set search_path = ''
as $$
declare
  _new_id bigint;
  _actor_name text;
  _actor_role public.app_role;
begin
  if _actor_id is not null then
    select full_name, role into _actor_name, _actor_role
      from public.profiles where id = _actor_id;
  end if;

  insert into public.audit_log (
    org_id, actor_id, actor_name, actor_role, action,
    target_table, target_id, summary, metadata, ip_address, user_agent
  ) values (
    _org_id, _actor_id, _actor_name, _actor_role, _action,
    _target_table, _target_id, _summary, _metadata, _ip, _user_agent
  )
  returning id into _new_id;

  return _new_id;
end $$;

-- PIN lockout: returns the timestamp the account is locked until, or null.
create or replace function public.check_pin_lockout(_profile_id uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select locked_until from public.profiles
   where id = _profile_id and locked_until > now();
$$;

-- Register a PIN attempt. After 5 failures in 15m, lock for 15m.
-- Returns the lockout timestamp (or null if not locked).
create or replace function public.register_pin_attempt(
  _profile_id   uuid,
  _org_slug     text,
  _employee     text,
  _success      boolean,
  _ip           inet default null,
  _user_agent   text default null
) returns timestamptz
language plpgsql
security definer set search_path = ''
as $$
declare
  _recent_failures int;
  _new_lock timestamptz;
begin
  insert into public.pin_attempts (
    org_slug, employee_number, profile_id, success, ip_address, user_agent
  ) values (
    _org_slug, _employee, _profile_id, _success, _ip, _user_agent
  );

  if _success then
    -- Clear any lockout on success.
    if _profile_id is not null then
      update public.profiles set locked_until = null
        where id = _profile_id and locked_until is not null;
    end if;
    return null;
  end if;

  if _profile_id is null then
    return null;
  end if;

  -- Count recent failures (15-minute window).
  select count(*) into _recent_failures
    from public.pin_attempts
   where profile_id = _profile_id
     and success = false
     and created_at > now() - interval '15 minutes';

  if _recent_failures >= 5 then
    _new_lock := now() + interval '15 minutes';
    update public.profiles
       set locked_until = _new_lock
     where id = _profile_id;
    perform public.log_audit_event(
      'pin.lockout', _profile_id, null, 'profiles', _profile_id::text,
      format('PIN locked after %s failed attempts', _recent_failures),
      jsonb_build_object('failures', _recent_failures), _ip, _user_agent
    );
    return _new_lock;
  end if;

  return null;
end $$;

-- ----------------------------------------------------------------------------
-- 10. Audit triggers on the most sensitive tables.
-- ----------------------------------------------------------------------------
create or replace function public.audit_profile_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  _changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      _changes := _changes || jsonb_build_object('role', jsonb_build_array(old.role, new.role));
    end if;
    if new.is_active is distinct from old.is_active then
      _changes := _changes || jsonb_build_object('is_active', jsonb_build_array(old.is_active, new.is_active));
    end if;
    if new.site_id is distinct from old.site_id then
      _changes := _changes || jsonb_build_object('site_id', jsonb_build_array(old.site_id, new.site_id));
    end if;
    if new.org_id is distinct from old.org_id then
      _changes := _changes || jsonb_build_object('org_id', jsonb_build_array(old.org_id, new.org_id));
    end if;
    if new.deleted_at is distinct from old.deleted_at then
      _changes := _changes || jsonb_build_object('deleted_at', jsonb_build_array(old.deleted_at, new.deleted_at));
    end if;

    if _changes <> '{}'::jsonb then
      perform public.log_audit_event(
        'profile.update', auth.uid(), new.org_id,
        'profiles', new.id::text,
        format('Profile %s updated', new.email),
        _changes
      );
    end if;
  elsif tg_op = 'INSERT' then
    perform public.log_audit_event(
      'profile.create', auth.uid(), new.org_id,
      'profiles', new.id::text,
      format('Profile %s created (%s)', new.email, new.role)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_audit on public.profiles;
create trigger trg_profiles_audit
  after insert or update on public.profiles
  for each row execute function public.audit_profile_change();

create or replace function public.audit_org_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.is_active is distinct from old.is_active then
      perform public.log_audit_event(
        case when new.is_active then 'org.activate' else 'org.suspend' end,
        auth.uid(), new.id, 'organizations', new.id::text,
        format('Organisation %s %s', new.name,
               case when new.is_active then 'activated' else 'suspended' end)
      );
    end if;
    if new.plan is distinct from old.plan then
      perform public.log_audit_event(
        'org.plan_change', auth.uid(), new.id,
        'organizations', new.id::text,
        format('Plan %s → %s', old.plan, new.plan),
        jsonb_build_object('old', old.plan, 'new', new.plan)
      );
    end if;
  elsif tg_op = 'INSERT' then
    perform public.log_audit_event(
      'org.create', auth.uid(), new.id, 'organizations', new.id::text,
      format('Organisation %s created', new.name)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_orgs_audit on public.organizations;
create trigger trg_orgs_audit
  after insert or update on public.organizations
  for each row execute function public.audit_org_change();

create or replace function public.audit_ack_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.log_audit_event(
    'manager.' || new.decision,
    auth.uid(), new.org_id, 'occurrences', new.occurrence_id::text,
    format('%s: %s — %s', new.ob_number, new.decision, coalesce(new.manager_notes, ''))
  );
  return new;
end $$;

drop trigger if exists trg_ack_audit on public.manager_acknowledgements;
create trigger trg_ack_audit
  after insert on public.manager_acknowledgements
  for each row execute function public.audit_ack_insert();

-- ----------------------------------------------------------------------------
-- 11. Convenient view for unread notification counts.
-- ----------------------------------------------------------------------------
drop view if exists public.notifications_unread_count cascade;
create view public.notifications_unread_count
  with (security_invoker = on) as
select user_id, count(*)::bigint as unread
  from public.notifications
 where read_at is null
 group by user_id;
grant select on public.notifications_unread_count to authenticated;

-- ----------------------------------------------------------------------------
-- 12. Org defaults for new audit/notification/pin_attempts tables.
-- ----------------------------------------------------------------------------
alter table public.notifications alter column org_id set default public.current_org_id();
alter table public.audit_log     alter column org_id set default public.current_org_id();
