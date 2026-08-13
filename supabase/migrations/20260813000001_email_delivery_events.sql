-- ============================================================================
-- DigiLog 360 — Email delivery events (bounces, complaints, confirmations)
--
-- email_log records what happened when we handed a message to Resend. That is
-- only half the story: an accepted message can still bounce, be rejected by
-- the recipient's server, or be marked as spam minutes later, and until now
-- none of that came back to us — a bounced alert sat in the ledger as "sent".
--
-- Resend reports the rest over a webhook. These columns hold what it tells us,
-- keyed on the provider id we already store, so the Delivery history can show
-- whether a message actually landed rather than merely left.
-- ============================================================================

alter table public.email_log
  add column if not exists provider_status    text,
  add column if not exists provider_status_at timestamptz,
  add column if not exists bounce_type        text,
  add column if not exists bounce_detail      text;

comment on column public.email_log.provider_status is
  'Latest delivery event from the provider: delivered, bounced, complained, delivery_delayed. Null means nothing has come back yet.';
comment on column public.email_log.bounce_type is
  'Provider bounce classification — hard, soft, suppressed, etc.';
comment on column public.email_log.bounce_detail is
  'The provider''s human-readable reason, shown verbatim in the audit table.';

-- The webhook looks rows up by provider id, so that lookup needs to be cheap.
create index if not exists idx_email_log_provider
  on public.email_log(provider_id) where provider_id is not null;

-- Surfacing failures is the whole point, so make the "something went wrong"
-- query cheap too.
create index if not exists idx_email_log_problems
  on public.email_log(org_id, id desc)
  where status = 'failed' or provider_status in ('bounced', 'complained');
