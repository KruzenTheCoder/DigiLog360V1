-- ============================================================================
-- Digilog360 — stop the trend line inventing a collapse
--
-- A routine record is promoted to "incident" when it is severe, past its SLA,
-- or has sat open for more than 48 hours. That is right for "what needs
-- attention now", and wrong for "how many incidents per week", because two of
-- those three conditions are TIME-DEPENDENT: a record from last month has had
-- a month to breach and to be left open, while one from this morning has had
-- neither.
--
-- Counting them the same way across history is survivorship bias, and it
-- showed: PMI's first forecast reported a run rate falling from 100.8
-- incidents a week to 8.6 — a 92% collapse that never happened. It was almost
-- entirely old routine records that had aged into the carve-out.
--
-- The trend now counts only the conditions that do not change with age: the
-- learned type, and severity. The backlog and SLA figures are unaffected —
-- those are meant to describe the present, and they are reported separately.
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
           end as bucket,
           -- Age-invariant classification, for anything compared over time.
           case
             when learned_kind = 'routine' and severity::text not in ('critical', 'high')
             then 'routine' else 'incident'
           end as stable_bucket
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
  -- Age-invariant, so week eight is measured the same way as this week.
  trend as (
    select coalesce(jsonb_agg(jsonb_build_object('week', wk, 'incidents', n) order by wk), '[]'::jsonb) as list
      from (
        select date_trunc('week', incident_at)::date as wk, count(*)::int as n
          from tagged where stable_bucket = 'incident' group by 1 order by 1
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

-- The forecast's projection is a mean of weekly counts, so it inherited the
-- same distortion — and it is the figure a manager plans staffing against.
create or replace function public.ai_forecast_facts(
  p_org      uuid,
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
  v_result jsonb;
begin
  with scoped as (
    select o.*, coalesce(m.kind::text, 'unknown') as learned_kind
      from public.occurrences o
      left join public.ai_type_memory m
        on m.org_id = o.org_id
       and lower(btrim(m.occurrence_type)) = lower(btrim(o.occurrence_type))
     where o.org_id = p_org
       and o.incident_at >= now() - interval '56 days'
       and (p_site is null or o.site_id = p_site)
       and (p_site_ids is null or o.site_id = any(p_site_ids))
  ),
  -- Trend and projection: age-invariant only.
  inc_stable as (
    select * from scoped
     where learned_kind <> 'routine' or severity::text in ('critical', 'high')
  ),
  -- Present-tense views (backlog, SLA): the full carve-out is right here,
  -- because these describe now rather than comparing across time.
  inc_now as (
    select * from scoped
     where learned_kind <> 'routine'
        or severity::text in ('critical', 'high')
        or (sla_due_at is not null and closed_at is null and sla_due_at < now())
  ),
  weekly as (
    select coalesce(jsonb_agg(jsonb_build_object('week', wk, 'incidents', n) order by wk), '[]'::jsonb) as list,
           coalesce(avg(n) filter (where wk >= date_trunc('week', now() - interval '28 days')::date), 0)::numeric(10,1) as recent_avg,
           coalesce(avg(n) filter (where wk <  date_trunc('week', now() - interval '28 days')::date), 0)::numeric(10,1) as prior_avg
      from (
        select date_trunc('week', incident_at)::date as wk, count(*)::int as n
          from inc_stable group by 1
      ) w
  ),
  backlog as (
    select
      count(*)::int as open_total,
      count(*) filter (where incident_at >= now() - interval '2 days')::int  as age_0_2,
      count(*) filter (where incident_at <  now() - interval '2 days'
                         and incident_at >= now() - interval '7 days')::int  as age_3_7,
      count(*) filter (where incident_at <  now() - interval '7 days'
                         and incident_at >= now() - interval '30 days')::int as age_8_30,
      count(*) filter (where incident_at <  now() - interval '30 days')::int as age_30_plus,
      count(*) filter (where assigned_to is null)::int                       as unassigned,
      count(*) filter (where severity::text in ('critical', 'high'))::int    as severe
      from inc_now
     where status::text not in ('resolved', 'closed', 'cancelled')
  ),
  sla as (
    select
      count(*) filter (where sla_due_at < now())::int as already_breached,
      count(*) filter (where sla_due_at >= now()
                         and sla_due_at < now() + interval '7 days')::int as due_next_7_days,
      count(*) filter (where sla_due_at >= now()
                         and sla_due_at < now() + interval '48 hours')::int as due_next_48h
      from inc_now
     where closed_at is null and sla_due_at is not null
  ),
  recurring as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'type', t, 'weeks_seen', wks, 'total', n,
             'per_week', round(n::numeric / greatest(1, wks), 1)
           ) order by wks desc, n desc), '[]'::jsonb) as list
      from (
        select occurrence_type as t,
               count(distinct date_trunc('week', incident_at))::int as wks,
               count(*)::int as n
          from inc_stable
         where occurrence_type is not null
         group by occurrence_type
        having count(distinct date_trunc('week', incident_at)) >= 3
         order by 2 desc, 3 desc limit 8
      ) r
  ),
  site_shift as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'site', s, 'last_7', l7, 'prior_7', p7,
             'change_pct', case when p7 = 0 then null
                           else round(((l7 - p7)::numeric / p7) * 100) end
           ) order by l7 desc), '[]'::jsonb) as list
      from (
        select coalesce(site_name, '—') as s,
               count(*) filter (where incident_at >= now() - interval '7 days')::int as l7,
               count(*) filter (where incident_at <  now() - interval '7 days'
                                  and incident_at >= now() - interval '14 days')::int as p7
          from inc_stable group by 1
         having count(*) filter (where incident_at >= now() - interval '14 days') > 0
         order by 2 desc limit 8
      ) x
  )
  select jsonb_build_object(
    'generated_at', now(),
    'weekly_incidents', (select list from weekly),
    'recent_week_avg',  (select recent_avg from weekly),
    'prior_week_avg',   (select prior_avg from weekly),
    'projected_next_week', (select round(recent_avg)::int from weekly),
    'trend_direction', (select case
        when prior_avg = 0 then 'no baseline'
        when recent_avg > prior_avg * 1.15 then 'rising'
        when recent_avg < prior_avg * 0.85 then 'falling'
        else 'steady' end from weekly),
    'open_backlog', (select to_jsonb(b) from backlog b),
    'sla_clock',    (select to_jsonb(s) from sla s),
    'recurring_types', (select list from recurring),
    'site_movement',   (select list from site_shift)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.ai_facts(uuid, integer, uuid, uuid[]) to authenticated, service_role;
grant execute on function public.ai_forecast_facts(uuid, uuid, uuid[]) to authenticated, service_role;
