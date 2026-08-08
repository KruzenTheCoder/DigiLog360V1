-- ============================================================================
-- DigiLog 360 — Occurrence-assignment emails + self-scheduling cron
--
--   • email_outbox.occurrence_id — outbox rows can now reference an
--     occurrence directly (occurrence.assigned), not only a task.
--   • Trigger on occurrences: any assignment change (log form, detail-page
--     assignment card, bulk assign, API) enqueues an 'occurrence.assigned'
--     email for the new reviewer. This closes the gap where the detail-page
--     card sent no email at all.
--   • admin_schedule_task_alerts(url, bearer) — a service-role-only helper
--     that schedules the every-minute task-alerts cron via pg_cron + pg_net,
--     so operators never have to paste SQL into the dashboard. The secrets
--     are passed as ARGUMENTS at call time; nothing sensitive lives in git.
--
-- Idempotent and forward-only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Outbox can point at an occurrence
-- ----------------------------------------------------------------------------
alter table public.email_outbox
  add column if not exists occurrence_id bigint references public.occurrences(id) on delete cascade;

-- ----------------------------------------------------------------------------
-- 2. Enqueue on occurrence assignment
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_occurrence_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.assigned_to is not null)
     or (tg_op = 'UPDATE'
         and new.assigned_to is distinct from old.assigned_to
         and new.assigned_to is not null) then
    insert into public.email_outbox (org_id, event, occurrence_id, payload)
    values (new.org_id, 'occurrence.assigned', new.id,
            jsonb_build_object('actor_id', auth.uid()));
  end if;
  return new;
end $$;

drop trigger if exists trg_occurrences_enqueue_email on public.occurrences;
create trigger trg_occurrences_enqueue_email
  after insert or update of assigned_to on public.occurrences
  for each row execute function public.enqueue_occurrence_email();

-- ----------------------------------------------------------------------------
-- 3. Self-scheduling cron (called once via RPC with runtime secrets)
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.admin_schedule_task_alerts(
  _function_url text,
  _bearer text
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  _jobid bigint;
begin
  perform cron.unschedule('digilog-task-alerts')
   where exists (select 1 from cron.job where jobname = 'digilog-task-alerts');

  select cron.schedule(
    'digilog-task-alerts',
    '* * * * *',
    format(
      $sql$select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || %L
                   ),
        body    := '{}'::jsonb
      );$sql$,
      _function_url, _bearer
    )
  ) into _jobid;

  return _jobid;
end $$;

-- Service role only — never callable from the apps.
revoke all on function public.admin_schedule_task_alerts(text, text) from public;
revoke all on function public.admin_schedule_task_alerts(text, text) from anon;
revoke all on function public.admin_schedule_task_alerts(text, text) from authenticated;
grant execute on function public.admin_schedule_task_alerts(text, text) to service_role;
