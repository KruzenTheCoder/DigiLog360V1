-- ============================================================================
-- DigiLog 360 — Multi-site RLS, phase 2: every remaining table.
--
-- Phase 1 (20260716000001) fixed occurrences / visitors / keys /
-- key_handovers and the helper functions. This phase sweeps the rest of the
-- schema for the same two defects:
--   1. single-site checks (site_id = current_site_id()) that hide data from
--      users assigned to multiple sites via profiles.site_ids[], and
--   2. per-row helper evaluation (helpers not wrapped in (select …)), which
--      makes unfiltered counts hit the statement timeout.
--
-- Note: policies built on can_access_site() were fixed automatically by
-- phase 1 (that helper now consults current_site_ids()), and
-- occurrence_comments inherit the parent occurrence's (fixed) visibility.
--
-- Idempotent — safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles — reviewers see colleagues at ANY shared site (arrays overlap),
--    not just their single legacy site.
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (
    (select public.is_super_user())
    or id = (select auth.uid())
    or (
      org_id = (select public.current_org_id())
      and (
        (select public.has_any_role(array['admin','manager','control_room']::public.app_role[]))
        or site_id in (select unnest(public.current_site_ids()))
        or site_ids && (select public.current_site_ids())
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Occurrence children — visible when the parent occurrence is at any of
--    the caller's sites (or their own log). Correlated lookups are pk-indexed.
-- ----------------------------------------------------------------------------
drop policy if exists updates_select on public.occurrence_updates;
create policy updates_select on public.occurrence_updates
  for select to authenticated using (
    (select public.is_admin())
    or exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
        and (o.logged_by = (select auth.uid())
             or o.site_id in (select unnest(public.current_site_ids())))
    )
  );

drop policy if exists reports_select on public.occurrence_reports;
create policy reports_select on public.occurrence_reports
  for select to authenticated using (
    (select public.is_admin())
    or exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
        and (o.logged_by = (select auth.uid())
             or o.site_id in (select unnest(public.current_site_ids())))
    )
  );

drop policy if exists images_select on public.occurrence_images;
create policy images_select on public.occurrence_images
  for select to authenticated using (
    (select public.is_admin())
    or exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
        and (o.logged_by = (select auth.uid())
             or o.site_id in (select unnest(public.current_site_ids())))
    )
  );

-- Voice notes — only on databases where the table has been created.
do $$
begin
  if to_regclass('public.occurrence_voice_notes') is not null then
    drop policy if exists voice_notes_select on public.occurrence_voice_notes;
    create policy voice_notes_select on public.occurrence_voice_notes
      for select to authenticated using (
        (select public.is_admin())
        or exists (
          select 1 from public.occurrences o
          where o.id = occurrence_id
            and (o.logged_by = (select auth.uid())
                 or o.site_id in (select unnest(public.current_site_ids())))
        )
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Patrols suite.
-- ----------------------------------------------------------------------------
drop policy if exists routes_select on public.patrol_routes;
create policy routes_select on public.patrol_routes
  for select to authenticated using (
    (select public.is_admin())
    or site_id in (select unnest(public.current_site_ids()))
  );

drop policy if exists routes_write on public.patrol_routes;
create policy routes_write on public.patrol_routes
  for all to authenticated using (
    (select public.is_admin())
    or (site_id in (select unnest(public.current_site_ids()))
        and (select public.has_any_role(array['control_room','supervisor']::public.app_role[])))
  ) with check (
    (select public.is_admin())
    or (site_id in (select unnest(public.current_site_ids()))
        and (select public.has_any_role(array['control_room','supervisor']::public.app_role[])))
  );

drop policy if exists checkpoints_select on public.checkpoints;
create policy checkpoints_select on public.checkpoints
  for select to authenticated using (
    (select public.is_admin())
    or site_id in (select unnest(public.current_site_ids()))
  );

drop policy if exists checkpoints_write on public.checkpoints;
create policy checkpoints_write on public.checkpoints
  for all to authenticated using (
    (select public.is_admin())
    or (site_id in (select unnest(public.current_site_ids()))
        and (select public.has_any_role(array['control_room','supervisor']::public.app_role[])))
  ) with check (
    (select public.is_admin())
    or (site_id in (select unnest(public.current_site_ids()))
        and (select public.has_any_role(array['control_room','supervisor']::public.app_role[])))
  );

drop policy if exists route_checkpoints_select on public.route_checkpoints;
create policy route_checkpoints_select on public.route_checkpoints
  for select to authenticated using (
    (select public.is_admin())
    or exists (
      select 1 from public.patrol_routes r
      where r.id = route_id
        and r.site_id in (select unnest(public.current_site_ids()))
    )
  );

drop policy if exists route_checkpoints_write on public.route_checkpoints;
create policy route_checkpoints_write on public.route_checkpoints
  for all to authenticated using (
    (select public.is_admin())
    or exists (
      select 1 from public.patrol_routes r
      where r.id = route_id
        and r.site_id in (select unnest(public.current_site_ids()))
        and (select public.has_any_role(array['control_room','supervisor']::public.app_role[]))
    )
  ) with check (
    (select public.is_admin())
    or exists (
      select 1 from public.patrol_routes r
      where r.id = route_id
        and r.site_id in (select unnest(public.current_site_ids()))
        and (select public.has_any_role(array['control_room','supervisor']::public.app_role[]))
    )
  );

drop policy if exists patrols_select on public.patrols;
create policy patrols_select on public.patrols
  for select to authenticated using (
    (select public.is_admin())
    or guard_id = (select auth.uid())
    or site_id in (select unnest(public.current_site_ids()))
  );

drop policy if exists patrols_update on public.patrols;
create policy patrols_update on public.patrols
  for update to authenticated using (
    (select public.is_admin())
    or guard_id = (select auth.uid())
    or (site_id in (select unnest(public.current_site_ids()))
        and (select public.has_any_role(array['control_room','supervisor']::public.app_role[])))
  ) with check (
    (select public.is_admin())
    or guard_id = (select auth.uid())
    or (site_id in (select unnest(public.current_site_ids()))
        and (select public.has_any_role(array['control_room','supervisor']::public.app_role[])))
  );

drop policy if exists scans_select on public.checkpoint_scans;
create policy scans_select on public.checkpoint_scans
  for select to authenticated using (
    (select public.is_admin())
    or guard_id = (select auth.uid())
    or exists (
      select 1 from public.patrols p
      where p.id = patrol_id
        and p.site_id in (select unnest(public.current_site_ids()))
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Shifts — guarded (table name differs across generations).
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.shifts') is not null then
    drop policy if exists shifts_select on public.shifts;
    create policy shifts_select on public.shifts
      for select to authenticated using (
        (select public.is_super_user())
        or (
          org_id = (select public.current_org_id())
          and (
            (select public.has_any_role(array['admin','manager','control_room','supervisor']::public.app_role[]))
            or user_id = (select auth.uid())
            or site_id in (select unnest(public.current_site_ids()))
          )
        )
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Supporting indexes for the scoped lookups.
-- ----------------------------------------------------------------------------
create index if not exists idx_patrols_site on public.patrols (site_id);
create index if not exists idx_patrol_routes_site on public.patrol_routes (site_id);
create index if not exists idx_checkpoints_site on public.checkpoints (site_id);

-- ----------------------------------------------------------------------------
-- 6. Diagnostic — list every policy now on the swept tables.
-- ----------------------------------------------------------------------------
select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in (
     'profiles','occurrences','occurrence_updates','occurrence_reports',
     'occurrence_images','occurrence_voice_notes','patrol_routes',
     'checkpoints','route_checkpoints','patrols','checkpoint_scans',
     'shifts','visitors','keys','key_handovers'
   )
 order by tablename, policyname;
