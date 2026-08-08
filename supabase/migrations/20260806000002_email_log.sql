-- ============================================================================
-- DigiLog 360 — Email delivery audit log
--
-- One row per recipient per send attempt, written by the task-alerts edge
-- function at the moment it talks to Resend. This is the audit history behind
-- Super User → Email Alerts → Delivery history: who was emailed, when, which
-- event, what subject, and what Resend said (message id or error).
--
-- The outbox (email_outbox) remains the QUEUE — one row per event, retried
-- until sent. This table is the LEDGER — an immutable record of every actual
-- delivery attempt, including dev-mode and test sends.
-- ============================================================================

create table if not exists public.email_log (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  outbox_id       bigint references public.email_outbox(id) on delete set null,
  event           text not null,
  task_id         bigint,
  occurrence_id   bigint,
  ob_number       text,
  recipient_id    uuid,
  recipient_name  text,
  recipient_email text not null,
  subject         text not null,
  status          text not null check (status in ('sent','failed','dev')),
  provider_id     text,
  error           text,
  is_test         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists idx_email_log_org_time on public.email_log(org_id, id desc);

alter table public.email_log enable row level security;

-- Read: super user only (matches email_outbox). Writes: service role only —
-- no policies needed, the edge function bypasses RLS.
drop policy if exists email_log_select on public.email_log;
create policy email_log_select on public.email_log
  for select to authenticated using (public.is_super_user());
