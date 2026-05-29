-- ============================================================================
-- DigiLog 360 — schedule the sla-monitor edge function (OPTIONAL)
-- Run this manually in the Supabase SQL editor AFTER deploying the function.
-- Requires the `pg_cron` and `pg_net` extensions (enable under Database → Extensions).
--
-- Replace the two placeholders below:
--   <PROJECT_REF>          your project ref (e.g. abcdefgh)
--   <SERVICE_ROLE_KEY>     Project Settings → API → service_role key
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any previous schedule with the same name.
select cron.unschedule('digilog-sla-monitor')
where exists (select 1 from cron.job where jobname = 'digilog-sla-monitor');

-- Run every 5 minutes.
select cron.schedule(
  'digilog-sla-monitor',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/sla-monitor',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
               ),
    body    := '{}'::jsonb
  );
  $$
);
