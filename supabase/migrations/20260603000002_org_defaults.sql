-- ============================================================================
-- DigiLog 360 — Default org_id from current_org_id() for client inserts.
-- Avoids forcing the apps to specify org_id on every insert; RLS still
-- enforces that callers can only write to their own org.
-- ============================================================================

do $$
declare _tbl text;
begin
  foreach _tbl in array array[
    'sites','occurrences','occurrence_updates','occurrence_reports',
    'occurrence_images','patrol_routes','checkpoints','route_checkpoints',
    'patrols','checkpoint_scans','manager_acknowledgements'
  ] loop
    execute format(
      'alter table public.%I alter column org_id set default public.current_org_id();',
      _tbl
    );
  end loop;
end $$;
