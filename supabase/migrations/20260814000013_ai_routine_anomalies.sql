-- ============================================================================
-- Digilog360 — routine types can still have abnormal instances
--
-- Classifying "Open & Close RTT warehouse" as routine is correct: opening a
-- warehouse is the job. But OB11978 is an "Open & Close RTT warehouse" logged
-- at HIGH severity and still open — something went wrong during a routine
-- task, and excluding it by type would have hidden it completely.
--
-- So the split is by type AND by exception. A record escapes its routine
-- classification when it is severe, past its SLA, or has been left open. That
-- is the "genuine anomaly" the system prompt already asks the model to watch
-- for, made structural instead of hopeful.
-- ============================================================================

-- The return type gains a column, which create-or-replace cannot do.
drop function if exists public.ai_incident_records(uuid, integer, uuid, uuid[], integer);

create function public.ai_incident_records(
  p_org      uuid,
  p_days     integer default 30,
  p_site     uuid default null,
  p_site_ids uuid[] default null,
  p_limit    integer default 80
)
returns table (
  id              bigint,
  ob_number       text,
  occurrence_type text,
  description     text,
  severity        text,
  status          text,
  site_name       text,
  incident_at     timestamptz,
  closed_at       timestamptz,
  sla_due_at      timestamptz,
  assigned_to     uuid,
  -- True when this row is a routine type that surfaced anyway. The prompt
  -- labels these, so the model can say "a routine task went wrong" rather than
  -- mistaking it for a new category of incident.
  routine_anomaly boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with j as (
    select o.*, coalesce(m.kind::text, 'incident') as kind
      from public.occurrences o
      left join public.ai_type_memory m
        on m.org_id = o.org_id
       and lower(btrim(m.occurrence_type)) = lower(btrim(o.occurrence_type))
     where o.org_id = p_org
       and o.incident_at >= now() - make_interval(days => greatest(1, least(365, p_days)))
       and (p_site is null or o.site_id = p_site)
       and (p_site_ids is null or o.site_id = any(p_site_ids))
  )
  select j.id, j.ob_number, j.occurrence_type, j.description,
         j.severity::text, j.status::text, j.site_name,
         j.incident_at, j.closed_at, j.sla_due_at, j.assigned_to,
         (j.kind = 'routine') as routine_anomaly
    from j
   where j.kind <> 'routine'
      -- …or it is routine but behaving abnormally:
      or j.severity::text in ('critical', 'high')
      or (j.sla_due_at is not null and j.closed_at is null and j.sla_due_at < now())
      or (j.status::text not in ('resolved', 'closed', 'cancelled')
          and j.incident_at < now() - interval '48 hours')
   order by
     (j.status::text not in ('resolved', 'closed', 'cancelled')) desc,
     (j.sla_due_at is not null and j.closed_at is null and j.sla_due_at < now()) desc,
     case j.severity::text
       when 'critical' then 0 when 'high' then 1
       when 'medium' then 2 when 'low' then 3 else 4 end,
     j.incident_at desc
   limit greatest(1, least(300, p_limit));
$$;

comment on function public.ai_incident_records is
  'Occurrences worth describing to the model: everything not classified as '
  'routine, plus routine-typed records that are severe, breaching, or left '
  'open — flagged as routine_anomaly so the briefing can name them as such.';

grant execute on function public.ai_incident_records(uuid, integer, uuid, uuid[], integer) to authenticated, service_role;

-- The same exception carve-out on the counting side, so the tiles and the
-- prose are drawn from the same population.
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
  -- How many routine records were pulled up by the exception rules. Worth
  -- naming in the briefing: "3 routine tasks went wrong" is a real finding.
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
      'by_status',            coalesce((select m from by_status where bucket = 'incident'), '{}'::jsonb)
    ),
    'routine', jsonb_build_object(
      'total',   coalesce((select total from facts where bucket = 'routine'), 0),
      'by_type', coalesce((select m from by_type where bucket = 'routine'), '{}'::jsonb),
      'by_site', coalesce((select m from by_site where bucket = 'routine'), '{}'::jsonb)
    ),
    'routine_anomalies', (select n from anomalies),
    'unknown_types', (select list from unknown_types),
    'incident_trend', (select list from trend)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.ai_facts(uuid, integer, uuid, uuid[]) to authenticated, service_role;
