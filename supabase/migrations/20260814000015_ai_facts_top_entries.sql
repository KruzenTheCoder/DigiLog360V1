-- ============================================================================
-- Digilog360 — name the top site and type explicitly
--
-- ai_facts returned by_site and by_type as jsonb objects built with
-- jsonb_object_agg, and the edge function read Object.entries(...)[0] as "the
-- busiest". jsonb does not preserve insertion order — it sorts keys by length,
-- then bytewise — so that read returned the SHORTEST key, not the largest
-- count.
--
-- Netstream's briefing showed "Busiest site: 1, 14% at —" when six of its
-- seven incidents were at one named site. "Most common type: Reports" was
-- correct only by coincidence, Reports being the shortest key as well as the
-- largest count.
--
-- The tallies stay as objects, which is the right shape for the prompt because
-- every count is explicit there. The tiles now read a top_* field ordered in
-- SQL, where ordering is something we control.
-- ============================================================================

create or replace function public.ai_facts(
  p_org      uuid,
  p_days     integer default 30,
  p_site     uuid default null,
  p_site_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since  timestamptz := now() - make_interval(days => greatest(1, least(365, p_days)));
  v_result jsonb;
begin
  with scoped as (
    select o.*, coalesce(m.kind::text, 'unknown') as learned_kind
      from public.occurrences o
      left join public.ai_type_memory m
        on m.org_id = o.org_id
       and lower(btrim(m.occurrence_type)) = lower(btrim(o.occurrence_type))
     where o.org_id = p_org
       and o.incident_at >= v_since
       and (p_site is null or o.site_id = p_site)
       and (p_site_ids is null or o.site_id = any(p_site_ids))
  ),
  tagged as (
    select *,
           case
             when learned_kind = 'routine'
              and severity::text not in ('critical', 'high')
              and not (sla_due_at is not null and closed_at is null and sla_due_at < now())
              and not (status::text not in ('resolved', 'closed', 'cancelled')
                       and incident_at < now() - interval '48 hours')
             then 'routine' else 'incident'
           end as bucket
      from scoped
  ),
  facts as (
    select bucket,
           count(*)::int as total,
           count(*) filter (where status::text not in ('resolved', 'closed', 'cancelled'))::int as open,
           count(*) filter (where sla_due_at is not null and closed_at is null and sla_due_at < now())::int as sla_breached,
           count(*) filter (where assigned_to is null)::int as unassigned,
           round(avg(extract(epoch from (closed_at - incident_at)) / 3600.0)
                 filter (where closed_at is not null))::int as avg_resolution_hours
      from tagged group by bucket
  ),
  by_type as (
    select bucket, jsonb_object_agg(t, n) as m from (
      select bucket, coalesce(occurrence_type, '—') as t, count(*)::int as n,
             row_number() over (partition by bucket order by count(*) desc) as rk
        from tagged group by bucket, occurrence_type
    ) x where rk <= 12 group by bucket
  ),
  by_site as (
    select bucket, jsonb_object_agg(s, n) as m from (
      select bucket, coalesce(site_name, '—') as s, count(*)::int as n,
             row_number() over (partition by bucket order by count(*) desc) as rk
        from tagged group by bucket, site_name
    ) x where rk <= 12 group by bucket
  ),
  -- Ordered in SQL, so the tiles cannot pick the wrong one.
  top_type as (
    select coalesce(occurrence_type, '—') as name, count(*)::int as n
      from tagged where bucket = 'incident'
     group by occurrence_type order by count(*) desc, 1 limit 1
  ),
  top_site as (
    select coalesce(site_name, '—') as name, count(*)::int as n
      from tagged where bucket = 'incident'
     group by site_name order by count(*) desc, 1 limit 1
  ),
  top_routine as (
    select coalesce(occurrence_type, '—') as name, count(*)::int as n
      from tagged where bucket = 'routine'
     group by occurrence_type order by count(*) desc, 1 limit 1
  ),
  by_severity as (
    select bucket, jsonb_object_agg(sv, n) as m from (
      select bucket, coalesce(severity::text, '—') as sv, count(*)::int as n
        from tagged group by bucket, severity
    ) x group by bucket
  ),
  by_status as (
    select bucket, jsonb_object_agg(st, n) as m from (
      select bucket, coalesce(status::text, '—') as st, count(*)::int as n
        from tagged group by bucket, status
    ) x group by bucket
  ),
  unknown_types as (
    select coalesce(jsonb_agg(t order by n desc), '[]'::jsonb) as list from (
      select occurrence_type as t, count(*)::int as n
        from scoped
       where learned_kind = 'unknown' and occurrence_type is not null
       group by occurrence_type limit 40
    ) u
  ),
  trend as (
    select coalesce(jsonb_agg(jsonb_build_object('week', wk, 'incidents', n) order by wk), '[]'::jsonb) as list
      from (
        select date_trunc('week', incident_at)::date as wk, count(*)::int as n
          from tagged where bucket = 'incident' group by 1 order by 1
      ) w
  ),
  anomalies as (
    select count(*)::int as n from tagged
     where learned_kind = 'routine' and bucket = 'incident'
  )
  select jsonb_build_object(
    'window_days', greatest(1, least(365, p_days)),
    'generated_at', now(),
    'total', (select count(*)::int from tagged),
    'incident', jsonb_build_object(
      'total',                coalesce((select total from facts where bucket = 'incident'), 0),
      'open',                 coalesce((select open from facts where bucket = 'incident'), 0),
      'sla_breached',         coalesce((select sla_breached from facts where bucket = 'incident'), 0),
      'unassigned',           coalesce((select unassigned from facts where bucket = 'incident'), 0),
      'avg_resolution_hours', (select avg_resolution_hours from facts where bucket = 'incident'),
      'by_type',              coalesce((select m from by_type where bucket = 'incident'), '{}'::jsonb),
      'by_site',              coalesce((select m from by_site where bucket = 'incident'), '{}'::jsonb),
      'by_severity',          coalesce((select m from by_severity where bucket = 'incident'), '{}'::jsonb),
      'by_status',            coalesce((select m from by_status where bucket = 'incident'), '{}'::jsonb),
      'top_type',             (select jsonb_build_object('name', name, 'count', n) from top_type),
      'top_site',             (select jsonb_build_object('name', name, 'count', n) from top_site)
    ),
    'routine', jsonb_build_object(
      'total',    coalesce((select total from facts where bucket = 'routine'), 0),
      'by_type',  coalesce((select m from by_type where bucket = 'routine'), '{}'::jsonb),
      'by_site',  coalesce((select m from by_site where bucket = 'routine'), '{}'::jsonb),
      'top_type', (select jsonb_build_object('name', name, 'count', n) from top_routine),
      'sites',    coalesce((select count(distinct coalesce(site_name, '—'))::int from tagged where bucket = 'routine'), 0)
    ),
    'routine_anomalies', (select n from anomalies),
    'unknown_types', (select list from unknown_types),
    'incident_trend', (select list from trend)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.ai_facts(uuid, integer, uuid, uuid[]) to authenticated, service_role;
