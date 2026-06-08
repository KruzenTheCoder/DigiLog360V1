-- ============================================================================
-- DigiLog 360 — Outbound webhooks + API tokens for external integrations.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. webhooks
-- ----------------------------------------------------------------------------
create table if not exists public.org_webhooks (
  id              uuid primary key default extensions.gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  url             text not null,
  secret          text not null,            -- HMAC SHA256 key (raw, server-side only)
  events          text[] not null default array['occurrence.created','sla.breach'],
  is_active       boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_delivered_at timestamptz,
  last_status     int
);
alter table public.org_webhooks enable row level security;

drop policy if exists webhooks_read on public.org_webhooks;
create policy webhooks_read on public.org_webhooks
  for select to authenticated using (
    public.is_super_user() or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists webhooks_write on public.org_webhooks;
create policy webhooks_write on public.org_webhooks
  for all to authenticated
  using (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()));

-- ----------------------------------------------------------------------------
-- 2. webhook_deliveries — last 200 deliveries per webhook for inspection
-- ----------------------------------------------------------------------------
create table if not exists public.webhook_deliveries (
  id            bigint generated always as identity primary key,
  webhook_id    uuid not null references public.org_webhooks(id) on delete cascade,
  org_id        uuid,
  event         text not null,
  status        int,
  request_body  jsonb,
  response_body text,
  delivered_at  timestamptz not null default now()
);
create index if not exists idx_webhook_deliveries_wh on public.webhook_deliveries(webhook_id, delivered_at desc);
alter table public.webhook_deliveries enable row level security;

drop policy if exists deliveries_read on public.webhook_deliveries;
create policy deliveries_read on public.webhook_deliveries
  for select to authenticated using (
    public.is_super_user() or (public.is_admin() and org_id = public.current_org_id())
  );

-- ----------------------------------------------------------------------------
-- 3. api_tokens
-- ----------------------------------------------------------------------------
create table if not exists public.api_tokens (
  id            uuid primary key default extensions.gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  name          text not null,
  prefix        text not null,                  -- public prefix shown in lists (e.g. "dl_live_abcd")
  hashed_secret text not null,                  -- SHA-256 of the full token (server stores only hash)
  scopes        text[] not null default array['read:occurrences'],
  created_by    uuid references public.profiles(id) on delete set null,
  expires_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists idx_api_tokens_org on public.api_tokens(org_id) where revoked_at is null;
create index if not exists idx_api_tokens_prefix on public.api_tokens(prefix);
alter table public.api_tokens enable row level security;

drop policy if exists tokens_read on public.api_tokens;
create policy tokens_read on public.api_tokens
  for select to authenticated using (
    public.is_super_user() or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists tokens_write on public.api_tokens;
create policy tokens_write on public.api_tokens
  for all to authenticated
  using (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_admin() and org_id = public.current_org_id()));

-- ----------------------------------------------------------------------------
-- 4. Trigger: when an occurrence is created, enqueue a webhook job.
--    We don't deliver inline — we just notify edge functions via NOTIFY.
-- ----------------------------------------------------------------------------
create or replace function public.notify_occurrence_event()
returns trigger language plpgsql as $$
begin
  perform pg_notify('digilog_events', json_build_object(
    'event', case when tg_op = 'INSERT' then 'occurrence.created' else 'occurrence.updated' end,
    'org_id', new.org_id,
    'occurrence_id', new.id,
    'ob_number', new.ob_number,
    'severity', new.severity,
    'status', new.status
  )::text);
  return new;
end $$;

drop trigger if exists trg_occ_notify on public.occurrences;
create trigger trg_occ_notify
  after insert or update of status on public.occurrences
  for each row execute function public.notify_occurrence_event();
