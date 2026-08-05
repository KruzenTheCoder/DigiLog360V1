-- ============================================================================
-- DigiLog 360 — Task email alerts
--
--   • org_email_settings — per-org configuration edited by the super user
--     (master switch, sender identity, accent colour, footer, and a jsonb
--     map of per-event overrides: enabled / subject template / intro template).
--   • email_outbox — durable at-least-once queue. Database triggers enqueue a
--     row for every task event; the `task-alerts` edge function drains it
--     (invoked fire-and-forget by the apps for immediacy, and by pg_cron as
--     the reliability sweep + overdue scanner).
--   • tasks.breach_alerted_at — dedupe stamp so an overdue task emails once.
--     Editing the due date re-arms the alert.
--
-- Idempotent and forward-only, consistent with every other migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Per-org settings
-- ----------------------------------------------------------------------------
create table if not exists public.org_email_settings (
  org_id                  uuid primary key references public.organizations(id) on delete cascade,
  enabled                 boolean not null default true,
  from_name               text,
  reply_to                text,
  accent_color            text,
  footer_note             text,
  notify_admins_on_breach boolean not null default false,
  events                  jsonb not null default '{}'::jsonb,
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.profiles(id) on delete set null
);

drop trigger if exists trg_org_email_settings_updated_at on public.org_email_settings;
create trigger trg_org_email_settings_updated_at
  before update on public.org_email_settings
  for each row execute function public.set_updated_at();

alter table public.org_email_settings enable row level security;

-- Org members may read (harmless; lets admins see what's configured).
drop policy if exists org_email_settings_select on public.org_email_settings;
create policy org_email_settings_select on public.org_email_settings
  for select to authenticated using (
    public.is_super_user() or org_id = public.current_org_id()
  );

-- Only the super user configures email alerts.
drop policy if exists org_email_settings_insert on public.org_email_settings;
create policy org_email_settings_insert on public.org_email_settings
  for insert to authenticated with check (public.is_super_user());

drop policy if exists org_email_settings_update on public.org_email_settings;
create policy org_email_settings_update on public.org_email_settings
  for update to authenticated using (public.is_super_user());

drop policy if exists org_email_settings_delete on public.org_email_settings;
create policy org_email_settings_delete on public.org_email_settings
  for delete to authenticated using (public.is_super_user());

-- ----------------------------------------------------------------------------
-- 2. Outbox
-- ----------------------------------------------------------------------------
create table if not exists public.email_outbox (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  event       text not null,
  task_id     bigint references public.tasks(id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending'
              check (status in ('pending','sending','sent','failed','skipped')),
  attempts    int not null default 0,
  last_error  text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);

create index if not exists idx_email_outbox_pending
  on public.email_outbox(created_at) where status = 'pending';

alter table public.email_outbox enable row level security;

-- Debug visibility for the super user only. No client writes — rows are
-- created by security-definer triggers and mutated by the service role.
drop policy if exists email_outbox_select on public.email_outbox;
create policy email_outbox_select on public.email_outbox
  for select to authenticated using (public.is_super_user());

-- ----------------------------------------------------------------------------
-- 3. Overdue dedupe stamp + re-arm on due-date change
-- ----------------------------------------------------------------------------
alter table public.tasks add column if not exists breach_alerted_at timestamptz;

create or replace function public.tasks_rearm_breach_alert()
returns trigger language plpgsql as $$
begin
  -- A moved due date is a fresh promise — arm the overdue alert again.
  if new.due_at is distinct from old.due_at then
    new.breach_alerted_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_tasks_rearm_breach on public.tasks;
create trigger trg_tasks_rearm_breach
  before update of due_at on public.tasks
  for each row execute function public.tasks_rearm_breach_alert();

-- ----------------------------------------------------------------------------
-- 4. Enqueue triggers
-- ----------------------------------------------------------------------------

-- Task lifecycle → outbox. SECURITY DEFINER so the insert clears RLS
-- regardless of which role performed the task mutation (same pattern as
-- audit_task_assignment).
create or replace function public.enqueue_task_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  _actor uuid := auth.uid();
begin
  -- New assignment (create with assignee, or reassignment).
  if (tg_op = 'INSERT' and new.assigned_to is not null)
     or (tg_op = 'UPDATE'
         and new.assigned_to is distinct from old.assigned_to
         and new.assigned_to is not null) then
    insert into public.email_outbox (org_id, event, task_id, payload)
    values (new.org_id, 'task.assigned', new.id,
            jsonb_build_object('actor_id', _actor));
  end if;

  -- Status transitions (completion is its own event; everything else,
  -- including cancellation, is an update).
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.email_outbox (org_id, event, task_id, payload)
    values (
      new.org_id,
      case when new.status = 'done' then 'task.completed' else 'task.updated' end,
      new.id,
      jsonb_build_object(
        'actor_id', _actor,
        'old_status', old.status,
        'new_status', new.status
      )
    );
  end if;

  return new;
end $$;

drop trigger if exists trg_tasks_enqueue_email on public.tasks;
create trigger trg_tasks_enqueue_email
  after insert or update on public.tasks
  for each row execute function public.enqueue_task_email();

-- Note-only timeline entries (status unchanged) also count as "updated".
-- Status-changing entries are ignored here — the tasks trigger above already
-- enqueued for those, so nothing double-fires.
create or replace function public.enqueue_task_note_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.notes is not null
     and btrim(new.notes) <> ''
     and new.previous_status is not distinct from new.new_status then
    insert into public.email_outbox (org_id, event, task_id, payload)
    select t.org_id, 'task.updated', t.id,
           jsonb_build_object(
             'actor_id', new.updated_by,
             'actor_name', new.updated_by_name,
             'notes', new.notes
           )
      from public.tasks t where t.id = new.task_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_task_updates_enqueue_email on public.task_updates;
create trigger trg_task_updates_enqueue_email
  after insert on public.task_updates
  for each row execute function public.enqueue_task_note_email();
