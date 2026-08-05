-- ============================================================================
-- DigiLog 360 — schedule the task-alerts edge function (OPTIONAL but
-- recommended). Run manually in the Supabase SQL editor AFTER deploying the
-- function. Requires `pg_cron` + `pg_net` (Database → Extensions).
--
-- The apps already invoke task-alerts fire-and-forget after every task
-- mutation, so assignment/update emails are near-instant. This schedule is
-- the reliability sweep (retries anything that failed) AND the overdue
-- scanner — overdue "breach" emails only fire from here, since no user
-- action happens when a due date passes.
--
-- Replace the two placeholders:
--   <PROJECT_REF>          your project ref (e.g. abcdefgh)
--   <SERVICE_ROLE_KEY>     Project Settings → API → service_role key
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('digilog-task-alerts')
where exists (select 1 from cron.job where jobname = 'digilog-task-alerts');

-- Every minute — cheap when the outbox is empty.
select cron.schedule(
  'digilog-task-alerts',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/task-alerts',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
               ),
    body    := '{}'::jsonb
  );
  $$
);
