-- ============================================================================
-- Digilog360 — Reporting lines (organogram) and occurrence escalation
--
-- One new column carries the whole hierarchy: profiles.reports_to. Everything
-- else — the org chart, "who does this escalate to", the chain of command —
-- is derived from it, so there is exactly one place to keep correct.
--
-- Escalating creates a TASK assigned to the person above. That is deliberate
-- reuse: an existing trigger already enqueues the task.assigned email when a
-- task is inserted, so the escalation lands in their task inbox AND their
-- mailbox through the pipeline that is already proven in production, rather
-- than a second notification path that could drift out of step.
-- ============================================================================

-- ─── The reporting line ─────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists reports_to uuid references public.profiles(id) on delete set null;

create index if not exists idx_profiles_reports_to on public.profiles(reports_to);

-- A reporting line that loops would make escalation walk forever. Reject the
-- cycle at write time rather than defending against it at every read.
create or replace function public.check_reports_to_acyclic()
returns trigger
language plpgsql
as $$
declare
  cursor_id uuid := new.reports_to;
  hops int := 0;
begin
  if new.reports_to is null then return new; end if;
  if new.reports_to = new.id then
    raise exception 'A person cannot report to themselves';
  end if;

  -- Walk up from the proposed manager; meeting ourselves means a loop.
  while cursor_id is not null and hops < 64 loop
    if cursor_id = new.id then
      raise exception 'That would create a reporting loop';
    end if;
    select reports_to into cursor_id from public.profiles where id = cursor_id;
    hops := hops + 1;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_profiles_reports_to_acyclic on public.profiles;
create trigger trg_profiles_reports_to_acyclic
  before insert or update of reports_to on public.profiles
  for each row execute function public.check_reports_to_acyclic();

-- ─── Escalation state on the occurrence ─────────────────────────────────────

alter table public.occurrences
  add column if not exists escalated_to     uuid references public.profiles(id) on delete set null,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists escalated_at     timestamptz;

create index if not exists idx_occurrences_escalated
  on public.occurrences(escalated_to) where escalated_to is not null;

-- ─── Audit of every escalation ──────────────────────────────────────────────

create table if not exists public.occurrence_escalations (
  id             bigint generated always as identity primary key,
  org_id         uuid not null references public.organizations(id) on delete cascade,
  occurrence_id  bigint not null references public.occurrences(id) on delete cascade,
  ob_number      text,
  from_user      uuid references public.profiles(id) on delete set null,
  from_name      text,
  to_user        uuid references public.profiles(id) on delete set null,
  to_name        text,
  -- 1 = first hop above the raiser, 2 = the level above that, and so on.
  level          integer not null default 1,
  reason         text,
  task_id        bigint references public.tasks(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_occ_esc_occurrence on public.occurrence_escalations(occurrence_id, id desc);
create index if not exists idx_occ_esc_org on public.occurrence_escalations(org_id, id desc);

alter table public.occurrence_escalations enable row level security;

drop policy if exists occ_esc_read on public.occurrence_escalations;
create policy occ_esc_read on public.occurrence_escalations
  for select to authenticated
  using (public.is_super_user() or org_id = public.current_org_id());

-- ─── Who does this go to? ───────────────────────────────────────────────────
-- The person above the raiser. If they have nobody above them, fall back to an
-- org admin so an escalation is never silently swallowed.
create or replace function public.resolve_escalation_target(p_user uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target uuid;
  org uuid;
begin
  select reports_to, org_id into target, org from public.profiles where id = p_user;
  if target is not null then return target; end if;

  -- No line manager recorded — hand it to an active admin in the same org,
  -- preferring an admin over a super user so it stays inside the business.
  select id into target
    from public.profiles
   where org_id = org
     and id <> p_user
     and coalesce(is_active, true)
     and role in ('admin', 'manager')
   order by case role when 'admin' then 0 else 1 end, full_name
   limit 1;

  return target;
end;
$$;

-- ─── Escalate ───────────────────────────────────────────────────────────────

create or replace function public.escalate_occurrence(
  p_occurrence_id bigint,
  p_reason        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller     uuid := auth.uid();
  v_caller_nm  text;
  v_org        uuid;
  v_occ        record;
  v_target     uuid;
  v_target_nm  text;
  v_task_id    bigint;
  v_level      integer;
begin
  if v_caller is null then
    raise exception 'Not signed in';
  end if;

  select full_name, org_id into v_caller_nm, v_org from public.profiles where id = v_caller;

  select id, ob_number, occurrence_type, description, status, severity, org_id,
         escalation_level, escalated_to
    into v_occ
    from public.occurrences
   where id = p_occurrence_id;

  if v_occ.id is null then
    raise exception 'Occurrence not found';
  end if;
  if v_occ.org_id <> v_org and not public.is_super_user() then
    raise exception 'That occurrence belongs to another organisation';
  end if;
  -- Escalating something already dealt with is almost always a mistake.
  if v_occ.status in ('resolved', 'closed') then
    raise exception 'This occurrence is already %, so there is nothing to escalate', v_occ.status;
  end if;

  -- Walk from whoever currently holds it, so a second escalation goes one
  -- level higher rather than back to the same manager.
  v_target := public.resolve_escalation_target(coalesce(v_occ.escalated_to, v_caller));

  if v_target is null then
    raise exception 'No one above % is recorded in the organogram — set a reporting line first',
      coalesce(v_caller_nm, 'you');
  end if;
  if v_target = coalesce(v_occ.escalated_to, v_caller) then
    raise exception 'This is already at the top of the reporting line';
  end if;

  select full_name into v_target_nm from public.profiles where id = v_target;
  v_level := coalesce(v_occ.escalation_level, 0) + 1;

  -- The task IS the notification. Inserting it fires the existing
  -- trg_tasks_enqueue_email trigger, which queues the task.assigned email.
  insert into public.tasks (
    org_id, title, description, priority, status,
    assigned_to, assigned_to_name, assigned_by, assigned_by_name,
    occurrence_id, ob_number, due_at
  ) values (
    v_org,
    format('Escalated: %s', coalesce(v_occ.ob_number, 'occurrence #' || v_occ.id)),
    format(
      E'%s escalated this occurrence to you.\n\nReason: %s\n\nType: %s\nSeverity: %s\nCurrent status: %s\n\n%s',
      coalesce(v_caller_nm, 'A colleague'),
      coalesce(nullif(trim(p_reason), ''), 'No reason given'),
      coalesce(v_occ.occurrence_type, '—'),
      coalesce(v_occ.severity::text, '—'),
      coalesce(v_occ.status::text, '—'),
      coalesce(left(v_occ.description, 500), '')
    ),
    case when v_occ.severity::text in ('critical', 'urgent') then 'urgent'::public.task_priority
         else 'high'::public.task_priority end,
    'open'::public.task_status,
    v_target, v_target_nm, v_caller, v_caller_nm,
    v_occ.id, v_occ.ob_number,
    now() + interval '24 hours'
  )
  returning id into v_task_id;

  insert into public.occurrence_escalations (
    org_id, occurrence_id, ob_number, from_user, from_name,
    to_user, to_name, level, reason, task_id
  ) values (
    v_org, v_occ.id, v_occ.ob_number, v_caller, v_caller_nm,
    v_target, v_target_nm, v_level, nullif(trim(p_reason), ''), v_task_id
  );

  update public.occurrences
     set escalated_to = v_target,
         escalation_level = v_level,
         escalated_at = now(),
         updated_at = now()
   where id = v_occ.id;

  return jsonb_build_object(
    'ok', true,
    'escalated_to', v_target,
    'escalated_to_name', v_target_nm,
    'level', v_level,
    'task_id', v_task_id
  );
end;
$$;

revoke all on function public.escalate_occurrence(bigint, text) from public;
grant execute on function public.escalate_occurrence(bigint, text) to authenticated;

-- ─── Org chart, in one round trip ───────────────────────────────────────────
-- Returns every person with their manager and their depth, so the client can
-- assemble the tree without recursive fetching.
create or replace function public.org_chart()
returns table (
  id uuid, full_name text, email text, role text,
  reports_to uuid, depth integer, path uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive roots as (
    select p.id, p.full_name, p.email, p.role::text, p.reports_to,
           0 as depth, array[p.id] as path
      from public.profiles p
     where (public.is_super_user() or p.org_id = public.current_org_id())
       and coalesce(p.is_active, true)
       and p.reports_to is null
    union all
    select c.id, c.full_name, c.email, c.role::text, c.reports_to,
           r.depth + 1, r.path || c.id
      from public.profiles c
      join roots r on c.reports_to = r.id
     where (public.is_super_user() or c.org_id = public.current_org_id())
       and coalesce(c.is_active, true)
       and not c.id = any(r.path)   -- belt and braces; the trigger prevents loops
  )
  select * from roots order by path;
$$;

grant execute on function public.org_chart() to authenticated;
