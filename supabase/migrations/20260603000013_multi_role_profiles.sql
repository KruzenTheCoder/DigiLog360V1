-- ============================================================================
-- DigiLog 360 — Multi-role profiles
--   A profile can now hold any subset of app_role values via profiles.roles[].
--   profiles.role is preserved as the "primary" role (always = roles[1]) so
--   that every existing query / display path keeps working without changes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. roles[] column + backfill
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists roles public.app_role[] not null
    default array[]::public.app_role[];

update public.profiles
   set roles = array[role]::public.app_role[]
 where (roles is null or coalesce(array_length(roles, 1), 0) = 0)
   and role is not null;

create index if not exists idx_profiles_roles_gin on public.profiles using gin (roles);

-- ----------------------------------------------------------------------------
-- 2. Sync trigger: roles[1] is the canonical primary. Whenever roles or role
--    changes, we make sure both columns agree.
-- ----------------------------------------------------------------------------
create or replace function public.sync_primary_role()
returns trigger language plpgsql as $$
begin
  if new.roles is not null and coalesce(array_length(new.roles, 1), 0) > 0 then
    -- primary always = roles[1]; ensure the named role is included in the set
    if new.role is null then
      new.role := new.roles[1];
    elsif not (new.role = any(new.roles)) then
      new.roles := array_prepend(new.role, new.roles);
    elsif new.role is distinct from new.roles[1] then
      -- caller changed primary but left it inside the set → re-order so
      -- primary is first.
      new.roles := array_prepend(new.role,
        array(select unnest(new.roles) except select new.role));
    end if;
  elsif new.role is not null then
    new.roles := array[new.role]::public.app_role[];
  end if;
  return new;
end $$;

drop trigger if exists trg_profile_sync_roles on public.profiles;
create trigger trg_profile_sync_roles
  before insert or update on public.profiles
  for each row execute function public.sync_primary_role();

-- ----------------------------------------------------------------------------
-- 3. RLS helper rewrite
-- ----------------------------------------------------------------------------
create or replace function public.current_app_roles()
returns public.app_role[]
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case when coalesce(array_length(roles, 1), 0) > 0
         then roles
         else array[role]::public.app_role[]
    end,
    array[]::public.app_role[]
  )
  from public.profiles where id = auth.uid();
$$;

-- Keep current_app_role() — it now returns the primary role.
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = '' as $$
  select (public.current_app_roles())[1];
$$;

create or replace function public.has_any_role(_roles public.app_role[])
returns boolean language sql stable as $$
  select coalesce(public.current_app_roles() && _roles, false);
$$;

create or replace function public.is_super_user()
returns boolean language sql stable as $$
  select public.has_any_role(array['super_user']::public.app_role[]);
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.has_any_role(array['admin','super_user']::public.app_role[]);
$$;

create or replace function public.is_manager()
returns boolean language sql stable as $$
  select public.has_any_role(array['manager','admin','super_user']::public.app_role[]);
$$;

-- ----------------------------------------------------------------------------
-- 4. Privilege escalation guard: extend the existing check to cover roles[].
-- ----------------------------------------------------------------------------
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _added public.app_role[];
begin
  -- Compute what's NEW in roles (set difference).
  _added := array(select unnest(coalesce(new.roles, array[]::public.app_role[]))
                  except
                  select unnest(coalesce(old.roles, array[]::public.app_role[])));

  -- Block granting super_user unless the caller is super_user.
  if 'super_user' = any(_added) and not public.is_super_user() then
    raise exception 'Only the super user may grant the super_user role.';
  end if;

  -- Org admins may change roles within their org; non-admins cannot.
  if (new.roles is distinct from old.roles)
     or (new.role is distinct from old.role)
     or (new.site_id is distinct from old.site_id)
     or (new.org_id  is distinct from old.org_id) then
    if not (public.is_admin() or auth.uid() is null) then
      raise exception 'Only administrators may change role, site or organization.';
    end if;
    if (new.org_id is distinct from old.org_id) and not public.is_super_user() then
      raise exception 'Only the super user may reassign a user to a different organization.';
    end if;
  end if;

  return new;
end $$;

-- Trigger already attached in earlier migration; no re-create needed.

-- ----------------------------------------------------------------------------
-- 5. handle_new_user: pick up `roles` array from signup metadata too.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _role  public.app_role;
  _roles public.app_role[];
  _site  uuid;
  _org   uuid;
  _emp   text;
begin
  -- Try roles[] first, fall back to single role.
  begin
    _roles := array(
      select x::public.app_role
        from jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'roles', '[]'::jsonb)) x
    );
  exception when others then _roles := array[]::public.app_role[]; end;

  begin _role := (new.raw_user_meta_data ->> 'role')::public.app_role;
  exception when others then _role := null; end;

  if coalesce(array_length(_roles, 1), 0) = 0 then
    _roles := array[coalesce(_role, 'guard')]::public.app_role[];
  end if;
  if _role is null then _role := _roles[1]; end if;

  begin _site := nullif(new.raw_user_meta_data ->> 'site_id', '')::uuid;
  exception when others then _site := null; end;

  begin _org  := nullif(new.raw_user_meta_data ->> 'org_id', '')::uuid;
  exception when others then _org  := null; end;

  _emp := nullif(new.raw_user_meta_data ->> 'employee_number', '');

  if _org is null then
    select id into _org from public.organizations where slug = 'digilog-demo' limit 1;
  end if;

  insert into public.profiles (
    id, email, full_name, role, roles, site_id, org_id, employee_number
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    _role,
    _roles,
    _site,
    _org,
    _emp
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
