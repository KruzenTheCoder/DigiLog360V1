-- Corrects generate_inspection_visits() from the previous migration, which
-- aliased the generated day twice (`g(d)` and a redundant `dd(d)` lateral) and
-- failed at runtime with "column reference \"d\" is ambiguous". The day column
-- is now named once and referenced consistently.
--
-- 20260814000002 carries the corrected body too, so a database built from
-- scratch is right first time; this migration exists to repair any database
-- that already applied the original.

create or replace function public.generate_inspection_visits(horizon_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  made integer := 0;
begin
  with slots as (
    select
      s.id  as schedule_id,
      s.org_id,
      s.site_id,
      s.title,
      s.instructions,
      s.checklist,
      s.window_minutes,
      assignee.id as assigned_to,
      ((g.gen_day::date + s.due_time) at time zone coalesce(si.timezone, 'Africa/Johannesburg')) as due_at
    from public.inspection_schedules s
    join public.sites si on si.id = s.site_id
    cross join lateral unnest(s.assignee_ids) as assignee(id)
    cross join lateral generate_series(
      greatest(s.starts_on, current_date)::date,
      least(coalesce(s.ends_on, current_date + horizon_days), current_date + horizon_days)::date,
      interval '1 day'
    ) as g(gen_day)
    where s.is_active
      and cardinality(s.assignee_ids) > 0
      and case s.frequency
            when 'daily'  then ((g.gen_day::date - s.starts_on) % s.interval_n) = 0
            when 'weekly' then extract(dow from g.gen_day)::smallint = any(s.days_of_week)
                            and ((floor((g.gen_day::date - s.starts_on) / 7.0)::int) % s.interval_n) = 0
            when 'monthly' then extract(day from g.gen_day)::smallint = s.day_of_month
                            and (( (extract(year from g.gen_day)::int * 12 + extract(month from g.gen_day)::int)
                                 - (extract(year from s.starts_on)::int * 12 + extract(month from s.starts_on)::int)
                                 ) % s.interval_n) = 0
            else false
          end
  )
  insert into public.inspection_visits
    (org_id, schedule_id, site_id, assigned_to, title, instructions, due_at, window_end, checklist)
  select
    slots.org_id, slots.schedule_id, slots.site_id, slots.assigned_to,
    slots.title, slots.instructions, slots.due_at,
    slots.due_at + make_interval(mins => slots.window_minutes),
    slots.checklist
  from slots
  where slots.due_at >= now() - interval '1 day'
  on conflict (schedule_id, assigned_to, due_at) where schedule_id is not null
  do nothing;

  get diagnostics made = row_count;
  return made;
end;
$$;
