-- ============================================================================
-- DigiLog 360 — Row Level Security (UAC)
-- Model:
--   admin                       → full access, all sites
--   control_room / supervisor   → manage records for their own site
--   guard                       → own records + read site checkpoints/occurrences
-- The service_role key (used by edge functions) bypasses RLS entirely.
-- ============================================================================

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Prevent non-admins from escalating their own role / moving sites.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.role is distinct from old.role) or (new.site_id is distinct from old.site_id) then
    if not (public.is_admin() or auth.uid() is null) then
      raise exception 'Only administrators may change a profile role or site assignment.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_no_escalation on public.profiles;
create trigger trg_profiles_no_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- Enable RLS everywhere.
alter table public.sites               enable row level security;
alter table public.profiles            enable row level security;
alter table public.occurrences         enable row level security;
alter table public.occurrence_updates  enable row level security;
alter table public.occurrence_reports  enable row level security;
alter table public.occurrence_images   enable row level security;
alter table public.patrol_routes       enable row level security;
alter table public.checkpoints         enable row level security;
alter table public.route_checkpoints   enable row level security;
alter table public.patrols             enable row level security;
alter table public.checkpoint_scans    enable row level security;

-- ----------------------------------------------------------------------------
-- sites
-- ----------------------------------------------------------------------------
drop policy if exists sites_select on public.sites;
create policy sites_select on public.sites
  for select to authenticated using (true);

drop policy if exists sites_admin_write on public.sites;
create policy sites_admin_write on public.sites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or public.is_admin()
    or (public.has_any_role(array['control_room','supervisor']::public.app_role[])
        and site_id = public.current_site_id())
  );

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated with check (public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- occurrences
-- ----------------------------------------------------------------------------
drop policy if exists occurrences_select on public.occurrences;
create policy occurrences_select on public.occurrences
  for select to authenticated using (
    public.is_admin()
    or logged_by = auth.uid()
    or site_id = public.current_site_id()
  );

drop policy if exists occurrences_insert on public.occurrences;
create policy occurrences_insert on public.occurrences
  for insert to authenticated with check (
    public.is_admin()
    or (logged_by = auth.uid()
        and (site_id = public.current_site_id() or site_id is null))
  );

drop policy if exists occurrences_update on public.occurrences;
create policy occurrences_update on public.occurrences
  for update to authenticated using (
    public.is_admin()
    or logged_by = auth.uid()
    or (public.has_any_role(array['control_room','supervisor']::public.app_role[])
        and site_id = public.current_site_id())
  ) with check (
    public.is_admin()
    or logged_by = auth.uid()
    or (public.has_any_role(array['control_room','supervisor']::public.app_role[])
        and site_id = public.current_site_id())
  );

drop policy if exists occurrences_delete_admin on public.occurrences;
create policy occurrences_delete_admin on public.occurrences
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- occurrence_updates  (visible if the parent occurrence is visible)
-- ----------------------------------------------------------------------------
drop policy if exists updates_select on public.occurrence_updates;
create policy updates_select on public.occurrence_updates
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
        and (o.logged_by = auth.uid() or o.site_id = public.current_site_id())
    )
  );

drop policy if exists updates_insert on public.occurrence_updates;
create policy updates_insert on public.occurrence_updates
  for insert to authenticated with check (
    public.is_admin()
    or (updated_by = auth.uid()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  );

drop policy if exists updates_admin_modify on public.occurrence_updates;
create policy updates_admin_modify on public.occurrence_updates
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- occurrence_reports
-- ----------------------------------------------------------------------------
drop policy if exists reports_select on public.occurrence_reports;
create policy reports_select on public.occurrence_reports
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
        and (o.logged_by = auth.uid() or o.site_id = public.current_site_id())
    )
  );

drop policy if exists reports_write on public.occurrence_reports;
create policy reports_write on public.occurrence_reports
  for all to authenticated using (
    public.is_admin()
    or public.has_any_role(array['control_room','supervisor']::public.app_role[])
  ) with check (
    public.is_admin()
    or public.has_any_role(array['control_room','supervisor']::public.app_role[])
  );

-- ----------------------------------------------------------------------------
-- occurrence_images
-- ----------------------------------------------------------------------------
drop policy if exists images_select on public.occurrence_images;
create policy images_select on public.occurrence_images
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
        and (o.logged_by = auth.uid() or o.site_id = public.current_site_id())
    )
  );

drop policy if exists images_insert on public.occurrence_images;
create policy images_insert on public.occurrence_images
  for insert to authenticated with check (
    public.is_admin() or captured_by = auth.uid()
  );

drop policy if exists images_delete on public.occurrence_images;
create policy images_delete on public.occurrence_images
  for delete to authenticated using (
    public.is_admin()
    or captured_by = auth.uid()
    or public.has_any_role(array['control_room','supervisor']::public.app_role[])
  );

-- ----------------------------------------------------------------------------
-- patrol_routes / checkpoints / route_checkpoints
--   read: any authenticated user at the site;  write: admin + site management
-- ----------------------------------------------------------------------------
drop policy if exists routes_select on public.patrol_routes;
create policy routes_select on public.patrol_routes
  for select to authenticated
  using (public.is_admin() or site_id = public.current_site_id());

drop policy if exists routes_write on public.patrol_routes;
create policy routes_write on public.patrol_routes
  for all to authenticated using (
    public.is_admin()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  ) with check (
    public.is_admin()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  );

drop policy if exists checkpoints_select on public.checkpoints;
create policy checkpoints_select on public.checkpoints
  for select to authenticated
  using (public.is_admin() or site_id = public.current_site_id());

drop policy if exists checkpoints_write on public.checkpoints;
create policy checkpoints_write on public.checkpoints
  for all to authenticated using (
    public.is_admin()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  ) with check (
    public.is_admin()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  );

drop policy if exists route_checkpoints_select on public.route_checkpoints;
create policy route_checkpoints_select on public.route_checkpoints
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.patrol_routes r
      where r.id = route_id and r.site_id = public.current_site_id()
    )
  );

drop policy if exists route_checkpoints_write on public.route_checkpoints;
create policy route_checkpoints_write on public.route_checkpoints
  for all to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.patrol_routes r
      where r.id = route_id and r.site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[])
    )
  ) with check (
    public.is_admin()
    or exists (
      select 1 from public.patrol_routes r
      where r.id = route_id and r.site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[])
    )
  );

-- ----------------------------------------------------------------------------
-- patrols
-- ----------------------------------------------------------------------------
drop policy if exists patrols_select on public.patrols;
create policy patrols_select on public.patrols
  for select to authenticated using (
    public.is_admin()
    or guard_id = auth.uid()
    or site_id = public.current_site_id()
  );

drop policy if exists patrols_insert on public.patrols;
create policy patrols_insert on public.patrols
  for insert to authenticated with check (
    public.is_admin() or guard_id = auth.uid()
  );

drop policy if exists patrols_update on public.patrols;
create policy patrols_update on public.patrols
  for update to authenticated using (
    public.is_admin()
    or guard_id = auth.uid()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  ) with check (
    public.is_admin()
    or guard_id = auth.uid()
    or (site_id = public.current_site_id()
        and public.has_any_role(array['control_room','supervisor']::public.app_role[]))
  );

drop policy if exists patrols_delete_admin on public.patrols;
create policy patrols_delete_admin on public.patrols
  for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- checkpoint_scans  (immutable proof-of-presence)
-- ----------------------------------------------------------------------------
drop policy if exists scans_select on public.checkpoint_scans;
create policy scans_select on public.checkpoint_scans
  for select to authenticated using (
    public.is_admin()
    or guard_id = auth.uid()
    or exists (
      select 1 from public.patrols p
      where p.id = patrol_id and p.site_id = public.current_site_id()
    )
  );

drop policy if exists scans_insert on public.checkpoint_scans;
create policy scans_insert on public.checkpoint_scans
  for insert to authenticated with check (
    public.is_admin()
    or (guard_id = auth.uid()
        and exists (
          select 1 from public.patrols p
          where p.id = patrol_id and p.guard_id = auth.uid()
        ))
  );

drop policy if exists scans_delete_admin on public.checkpoint_scans;
create policy scans_delete_admin on public.checkpoint_scans
  for delete to authenticated using (public.is_admin());
