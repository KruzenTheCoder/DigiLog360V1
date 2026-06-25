-- ============================================================================
-- DigiLog 360 — Task inbox
--
-- Mirrors the legacy TaskItems / TaskUpdates module: anyone can be assigned
-- a task (typically by a manager / control_room / supervisor), tasks have
-- priority + status + due date, and every status change writes a row to
-- task_updates as the immutable audit trail.
-- ============================================================================

do $$ begin
  create type public.task_status as enum (
    'open', 'in_progress', 'blocked', 'done', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
exception when duplicate_object then null; end $$;

create table if not exists public.tasks (
  id                bigint generated always as identity primary key,
  org_id            uuid not null references public.organizations(id) on delete cascade,
  title             text not null,
  description       text,
  priority          public.task_priority not null default 'normal',
  status            public.task_status not null default 'open',
  assigned_to       uuid references public.profiles(id) on delete set null,
  assigned_to_name  text,
  assigned_by       uuid references public.profiles(id) on delete set null,
  assigned_by_name  text,
  occurrence_id     bigint references public.occurrences(id) on delete set null,
  ob_number         text,
  due_at            timestamptz,
  completed_at      timestamptz,
  completed_by      uuid references public.profiles(id) on delete set null,
  completion_notes  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.tasks alter column org_id set default public.current_org_id();

create index if not exists idx_tasks_org_status     on public.tasks(org_id, status);
create index if not exists idx_tasks_assignee_open  on public.tasks(assigned_to, status) where status not in ('done','cancelled');
create index if not exists idx_tasks_due            on public.tasks(due_at) where status not in ('done','cancelled');

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- task_updates — append-only audit trail of status / notes changes
-- ----------------------------------------------------------------------------
create table if not exists public.task_updates (
  id                bigint generated always as identity primary key,
  org_id            uuid,
  task_id           bigint not null references public.tasks(id) on delete cascade,
  previous_status   public.task_status,
  new_status        public.task_status not null,
  notes             text,
  updated_by        uuid references public.profiles(id) on delete set null,
  updated_by_name   text,
  created_at        timestamptz not null default now()
);

alter table public.task_updates alter column org_id set default public.current_org_id();
create index if not exists idx_task_updates_task on public.task_updates(task_id, created_at desc);

-- ============================================================================
-- RLS
--   • read    : super_user OR caller is assignee OR same org
--   • insert  : super_user OR same org AND caller is reviewer (admin/manager/
--               control_room/supervisor)
--   • update  : super_user OR caller is assignee OR caller is reviewer in org
--   • delete  : admin / super_user only
-- ============================================================================
alter table public.tasks enable row level security;
alter table public.task_updates enable row level security;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated using (
    public.is_super_user()
    or assigned_to = auth.uid()
    or org_id = public.current_org_id()
  );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(
        array['admin','manager','control_room','supervisor']::public.app_role[]
      )
    )
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated using (
    public.is_super_user()
    or assigned_to = auth.uid()
    or (
      org_id = public.current_org_id()
      and public.has_any_role(
        array['admin','manager','control_room','supervisor']::public.app_role[]
      )
    )
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated using (
    public.is_super_user()
    or (public.is_admin() and org_id = public.current_org_id())
  );

drop policy if exists task_updates_select on public.task_updates;
create policy task_updates_select on public.task_updates
  for select to authenticated using (
    public.is_super_user()
    or exists (
      select 1 from public.tasks t
       where t.id = task_id
         and (t.assigned_to = auth.uid() or t.org_id = public.current_org_id())
    )
  );

drop policy if exists task_updates_insert on public.task_updates;
create policy task_updates_insert on public.task_updates
  for insert to authenticated with check (
    public.is_super_user()
    or (
      org_id = public.current_org_id()
      and exists (
        select 1 from public.tasks t
         where t.id = task_id
           and (t.assigned_to = auth.uid()
                or public.has_any_role(
                  array['admin','manager','control_room','supervisor']::public.app_role[]
                ))
      )
    )
  );

-- ============================================================================
-- Triggers
-- ============================================================================

-- 1. When a task is created OR re-assigned, notify the assignee + audit.
create or replace function public.audit_task_assignment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  _changed boolean;
begin
  _changed := (tg_op = 'INSERT')
    or (new.assigned_to is distinct from old.assigned_to);

  if not _changed then return new; end if;

  if new.assigned_to is not null then
    -- Look up the friendly name if it wasn't supplied.
    if new.assigned_to_name is null then
      select full_name into new.assigned_to_name
        from public.profiles where id = new.assigned_to;
    end if;

    begin
      insert into public.notifications (org_id, user_id, kind, title, body, data)
      values (
        new.org_id, new.assigned_to, 'task.assigned',
        'New task: ' || new.title,
        coalesce(left(new.description, 160),
                 case when new.ob_number is not null then 'Related to ' || new.ob_number else null end,
                 'You have been assigned a new task'),
        jsonb_build_object(
          'task_id', new.id,
          'priority', new.priority,
          'due_at', new.due_at
        )
      );
    exception when undefined_table then null; end;

    begin
      perform public.log_audit_event(
        case when tg_op = 'INSERT' then 'task.create' else 'task.reassign' end,
        auth.uid(), new.org_id, 'tasks', new.id::text,
        'Task "' || new.title || '" assigned to ' || coalesce(new.assigned_to_name, new.assigned_to::text)
      );
    exception when undefined_function then null; end;
  end if;

  return new;
end $$;

drop trigger if exists trg_tasks_assignment on public.tasks;
create trigger trg_tasks_assignment
  before insert or update on public.tasks
  for each row execute function public.audit_task_assignment();

-- 2. When status moves to done/cancelled, stamp completed_at.
create or replace function public.tasks_apply_completion()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status in ('done','cancelled') and old.status not in ('done','cancelled') then
    new.completed_at := coalesce(new.completed_at, now());
    if new.completed_by is null then new.completed_by := auth.uid(); end if;
  elsif new.status not in ('done','cancelled') then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_tasks_completion on public.tasks;
create trigger trg_tasks_completion
  before update of status on public.tasks
  for each row execute function public.tasks_apply_completion();

-- Publish to realtime for live inboxes.
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.task_updates;
exception when duplicate_object then null; when undefined_object then null; end $$;
