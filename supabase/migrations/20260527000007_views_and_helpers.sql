-- ============================================================================
-- DigiLog 360 — Dashboard views & helper functions
-- ============================================================================

-- Great-circle distance in metres (used for GPS checkpoint verification).
create or replace function public.haversine_m(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- ----------------------------------------------------------------------------
-- occurrences_live — open occurrences with computed SLA state.
-- security_invoker => the querying user's RLS still applies.
--
-- Use DROP + CREATE rather than OR REPLACE: later migrations add columns to
-- public.occurrences (org_id, assigned_to, deleted_at, …), and `select o.*`
-- expands at parse time. OR REPLACE refuses any column reordering, so re-
-- running this file against an already-evolved schema would fail with
-- "cannot change name of view column".
-- ----------------------------------------------------------------------------
drop view if exists public.occurrences_live cascade;
create view public.occurrences_live
  with (security_invoker = on) as
select
  o.*,
  public.severity_update_interval_minutes(o.severity) as update_interval_minutes,
  (o.status not in ('resolved','closed')
    and o.sla_due_at is not null
    and now() > o.sla_due_at) as is_sla_breached,
  (o.status not in ('resolved','closed')
    and (o.last_sla_update_at is null
         or now() >= o.last_sla_update_at
              + make_interval(mins => public.severity_update_interval_minutes(o.severity)))
  ) as is_sla_update_due,
  case
    when o.status in ('resolved','closed') or o.sla_due_at is null then null
    else round(extract(epoch from (o.sla_due_at - now())) / 60.0)
  end as minutes_remaining,
  (exists (select 1 from public.occurrence_reports r where r.occurrence_id = o.id)) as has_report
from public.occurrences o
where o.status not in ('resolved','closed');

-- ----------------------------------------------------------------------------
-- patrols_detailed — patrol rows enriched with route & scan progress.
-- Same DROP/CREATE rationale as occurrences_live above.
-- ----------------------------------------------------------------------------
drop view if exists public.patrols_detailed cascade;
create view public.patrols_detailed
  with (security_invoker = on) as
select
  p.*,
  r.name as route_name,
  s.name as site_name,
  (select count(*) from public.checkpoint_scans cs where cs.patrol_id = p.id) as scan_count
from public.patrols p
left join public.patrol_routes r on r.id = p.route_id
left join public.sites s on s.id = p.site_id;

grant select on public.occurrences_live to authenticated;
grant select on public.patrols_detailed to authenticated;
