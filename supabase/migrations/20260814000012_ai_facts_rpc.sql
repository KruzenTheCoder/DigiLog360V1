-- ============================================================================
-- Digilog360 — deterministic facts for the insight engine
--
-- The briefing's numbers are arithmetic, not opinion, so they are computed
-- here rather than inferred by a model. Doing it in SQL also removes the
-- reason the old prompt was capped at 200 rows: we no longer ship occurrences
-- to the edge function just to count them. A 30-day window for an org logging
-- 5 000 occurrences is now one round trip that transfers a few hundred bytes.
--
-- The routine/incident split is applied HERE, using what the platform has
-- learned in ai_type_memory, so the engine can send routine activity as a
-- counted line and spend its token budget on the incidents.
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
    select o.*,
           coalesce(m.kind::text, 'unknown') as learned_kind
      from public.occurrences o
      left join public.ai_type_memory m
        on m.org_id = o.org_id
       and lower(btrim(m.occurrence_type)) = lower(btrim(o.occurrence_type))
     where o.org_id = p_org
       and o.incident_at >= v_since
       and (p_site is null or o.site_id = p_site)
       -- Roles below manager are bounded to their own sites. A null array
       -- means "unscoped" (admin, manager, super user), not "no sites".
       and (p_site_ids is null or o.site_id = any(p_site_ids))
  ),
  -- Anything not yet classified is treated as an incident until the engine
  -- learns otherwise. Erring towards "show it" is the safe default: a missed
  -- incident is far more costly than one extra line about a gate.
  tagged as (
    select *, case when learned_kind = 'routine' then 'routine' else 'incident' end as bucket
      from scoped
  ),
  facts as (
    select
      bucket,
      count(*)::int as total,
      count(*) filter (
        where status::text not in ('resolved', 'closed', 'cancelled')
      )::int as open,
      count(*) filter (
        where sla_due_at is not null and closed_at is null and sla_due_at < now()
      )::int as sla_breached,
      count(*) filter (where assigned_to is null)::int as unassigned,
      round(avg(
        extract(epoch from (closed_at - incident_at)) / 3600.0
      ) filter (where closed_at is not null))::int as avg_resolution_hours
      from tagged
     group by bucket
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
  -- Types seen in this window that the engine has never classified. These are
  -- the ONLY thing the classifier needs to look at.
  unknown_types as (
    select coalesce(jsonb_agg(t order by n desc), '[]'::jsonb) as list from (
      select occurrence_type as t, count(*)::int as n
        from scoped
       where learned_kind = 'unknown' and occurrence_type is not null
       group by occurrence_type
       limit 40
    ) u
  ),
  -- Week-by-week incident counts: a trend line the model never has to infer.
  trend as (
    select coalesce(jsonb_agg(jsonb_build_object('week', wk, 'incidents', n) order by wk), '[]'::jsonb) as list
      from (
        select date_trunc('week', incident_at)::date as wk, count(*)::int as n
          from tagged where bucket = 'incident'
         group by 1 order by 1
      ) w
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
    'unknown_types', (select list from unknown_types),
    'incident_trend', (select list from trend)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.ai_facts is
  'Deterministic occurrence facts for one org over a window, split into '
  'incidents and routine operations using ai_type_memory. Replaces shipping '
  'raw rows to the edge function purely to count them.';

-- ─── The incident records themselves ────────────────────────────────────────

-- Only incidents carry their descriptions into the prompt. Routine activity is
-- already fully represented by the tallies above, and it was consuming ~97% of
-- the payload for nothing.
create or replace function public.ai_incident_records(
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
  assigned_to     uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.ob_number, o.occurrence_type, o.description,
         o.severity::text, o.status::text, o.site_name,
         o.incident_at, o.closed_at, o.sla_due_at, o.assigned_to
    from public.occurrences o
    left join public.ai_type_memory m
      on m.org_id = o.org_id
     and lower(btrim(m.occurrence_type)) = lower(btrim(o.occurrence_type))
   where o.org_id = p_org
     and o.incident_at >= now() - make_interval(days => greatest(1, least(365, p_days)))
     and (p_site is null or o.site_id = p_site)
     and (p_site_ids is null or o.site_id = any(p_site_ids))
     and coalesce(m.kind::text, 'incident') <> 'routine'
   -- Unresolved and severe first: if the cap ever bites, it must bite on the
   -- closed and the trivial, never on an open critical.
   order by
     (o.status::text not in ('resolved', 'closed', 'cancelled')) desc,
     (o.sla_due_at is not null and o.closed_at is null and o.sla_due_at < now()) desc,
     case o.severity::text
       when 'critical' then 0 when 'high' then 1
       when 'medium' then 2 when 'low' then 3 else 4 end,
     o.incident_at desc
   limit greatest(1, least(300, p_limit));
$$;

comment on function public.ai_incident_records is
  'Incident occurrences for the prompt, most severe and least resolved first '
  'so a cap can never hide an open critical.';

grant execute on function public.ai_facts(uuid, integer, uuid, uuid[]) to authenticated, service_role;
grant execute on function public.ai_incident_records(uuid, integer, uuid, uuid[], integer) to authenticated, service_role;

-- Both functions filter on (org_id, incident_at); make that the access path.
create index if not exists idx_occurrences_org_incident_at
  on public.occurrences(org_id, incident_at desc);
