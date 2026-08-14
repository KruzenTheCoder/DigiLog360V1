-- ============================================================================
-- Digilog360 — forward-looking facts
--
-- The weekly digest looks backwards: here is what happened, here is what to do
-- about it. A forecast is a different question — what is likely to land on the
-- team next week, and what can be pre-empted now.
--
-- Everything here is still arithmetic. A projection the model invents is a
-- guess; a projection computed from four weeks of trend, the open backlog and
-- the SLA clock is a forecast. The model's job is to explain it, not to
-- produce it.
-- ============================================================================

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
    select o.*,
           coalesce(m.kind::text, 'unknown') as learned_kind
      from public.occurrences o
      left join public.ai_type_memory m
        on m.org_id = o.org_id
       and lower(btrim(m.occurrence_type)) = lower(btrim(o.occurrence_type))
     where o.org_id = p_org
       and o.incident_at >= now() - interval '56 days'
       and (p_site is null or o.site_id = p_site)
       and (p_site_ids is null or o.site_id = any(p_site_ids))
  ),
  -- Same carve-out as the briefing: a routine task that went wrong counts.
  inc as (
    select * from scoped
     where learned_kind <> 'routine'
        or severity::text in ('critical', 'high')
        or (sla_due_at is not null and closed_at is null and sla_due_at < now())
  ),
  -- Eight weeks of incident counts. Four would be a line; eight is a trend
  -- you can see seasonality in.
  weekly as (
    select coalesce(jsonb_agg(jsonb_build_object('week', wk, 'incidents', n) order by wk), '[]'::jsonb) as list,
           coalesce(avg(n) filter (where wk >= date_trunc('week', now() - interval '28 days')::date), 0)::numeric(10,1) as recent_avg,
           coalesce(avg(n) filter (where wk <  date_trunc('week', now() - interval '28 days')::date), 0)::numeric(10,1) as prior_avg
      from (
        select date_trunc('week', incident_at)::date as wk, count(*)::int as n
          from inc group by 1
      ) w
  ),
  -- What is already on the books going into next week. This is the single
  -- most predictive number there is: it does not have to be forecast at all.
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
      from inc
     where status::text not in ('resolved', 'closed', 'cancelled')
  ),
  -- The SLA clock, which is knowledge rather than prediction.
  sla as (
    select
      count(*) filter (where sla_due_at < now())::int as already_breached,
      count(*) filter (where sla_due_at >= now()
                         and sla_due_at < now() + interval '7 days')::int as due_next_7_days,
      count(*) filter (where sla_due_at >= now()
                         and sla_due_at < now() + interval '48 hours')::int as due_next_48h
      from inc
     where closed_at is null and sla_due_at is not null
  ),
  -- Types that recur week after week are the ones that will recur again.
  recurring as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'type', t, 'weeks_seen', wks, 'total', n,
             'per_week', round(n::numeric / greatest(1, wks), 1)
           ) order by wks desc, n desc), '[]'::jsonb) as list
      from (
        select occurrence_type as t,
               count(distinct date_trunc('week', incident_at))::int as wks,
               count(*)::int as n
          from inc
         where occurrence_type is not null
         group by occurrence_type
        having count(distinct date_trunc('week', incident_at)) >= 3
         order by 2 desc, 3 desc
         limit 8
      ) r
  ),
  -- Where it is concentrating, and whether that is moving.
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
          from inc group by 1
         having count(*) filter (where incident_at >= now() - interval '14 days') > 0
         order by 2 desc limit 8
      ) x
  )
  select jsonb_build_object(
    'generated_at', now(),
    'weekly_incidents', (select list from weekly),
    'recent_week_avg',  (select recent_avg from weekly),
    'prior_week_avg',   (select prior_avg from weekly),
    -- The projection itself: recent four-week mean, which beats last week
    -- alone on noisy data and is honest about being a mean.
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

comment on function public.ai_forecast_facts is
  'Forward-looking arithmetic for the week-ahead forecast: trend, open '
  'backlog by age, the SLA clock, recurring types and where incidents are '
  'moving. The model explains these; it does not produce them.';

grant execute on function public.ai_forecast_facts(uuid, uuid, uuid[]) to authenticated, service_role;
