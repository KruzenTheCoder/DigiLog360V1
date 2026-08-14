-- Monday 06:00 UTC — the "week ahead" digest.
--
-- Calls the ai-assistant function with the service key as bearer, which the
-- function accepts as an internal caller. Guarded so a project without pg_net
-- or pg_cron still migrates cleanly; the digest can be driven externally.
do $$
begin
  perform cron.unschedule('ai-weekly-digest');
exception when others then null;
end $$;

do $$
declare
  fn_url text;
  svc    text;
begin
  select decrypted_secret into svc from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  -- Fall back to the project setting used by the other scheduled jobs.
  if svc is null then
    svc := current_setting('app.settings.service_role_key', true);
  end if;
  fn_url := coalesce(current_setting('app.settings.functions_url', true), '') || '/ai-assistant';

  perform cron.schedule(
    'ai-weekly-digest',
    '0 6 * * 1',
    format(
      $cron$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || %L
          ),
          body := '{"mode":"weekly_digest"}'::jsonb
        );
      $cron$, fn_url, coalesce(svc, '')
    )
  );
exception when others then
  raise notice 'weekly digest cron not scheduled (%) — run it from an external scheduler instead', sqlerrm;
end $$;
