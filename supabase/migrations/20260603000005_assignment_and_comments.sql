-- ============================================================================
-- DigiLog 360 — Assignment + comments
--   • occurrences.assigned_to / assigned_at / assigned_by
--   • occurrence_comments table (free-form thread, distinct from status updates)
-- ============================================================================

alter table public.occurrences
  add column if not exists assigned_to       uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at       timestamptz,
  add column if not exists assigned_by       uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_to_name  text;

create index if not exists idx_occ_assigned_to on public.occurrences(assigned_to)
  where assigned_to is not null;

-- ----------------------------------------------------------------------------
-- occurrence_comments
-- ----------------------------------------------------------------------------
create table if not exists public.occurrence_comments (
  id            bigint generated always as identity primary key,
  org_id        uuid,                        -- defaulted below if multi-tenant
  occurrence_id bigint not null references public.occurrences(id) on delete cascade,
  ob_number     text,
  author_id     uuid references public.profiles(id) on delete set null,
  author_name   text,
  body          text not null,
  edited_at     timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_comments_occ on public.occurrence_comments(occurrence_id, created_at);
create index if not exists idx_comments_author on public.occurrence_comments(author_id);

-- Default org_id if the multi-tenant helper exists.
do $$ begin
  alter table public.occurrence_comments alter column org_id set default public.current_org_id();
exception when undefined_function then null; end $$;

alter table public.occurrence_comments enable row level security;

-- ----------------------------------------------------------------------------
-- RLS — visible if you can see the parent occurrence; writable by reviewers
-- and the comment's author.
-- ----------------------------------------------------------------------------
drop policy if exists comments_select on public.occurrence_comments;
create policy comments_select on public.occurrence_comments
  for select to authenticated using (
    exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
    )
  );

drop policy if exists comments_insert on public.occurrence_comments;
create policy comments_insert on public.occurrence_comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (select 1 from public.occurrences o where o.id = occurrence_id)
  );

drop policy if exists comments_update_own on public.occurrence_comments;
create policy comments_update_own on public.occurrence_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists comments_delete on public.occurrence_comments;
create policy comments_delete on public.occurrence_comments
  for delete to authenticated using (
    author_id = auth.uid()
    or (
      -- Admin / manager can prune their org's threads.
      coalesce((select public.is_admin()), false)
      or coalesce((select public.is_manager()), false)
    )
  );

-- Realtime publication.
do $$ begin
  alter publication supabase_realtime add table public.occurrence_comments;
exception when duplicate_object then null;
when undefined_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Audit + notification when an occurrence gets assigned.
-- ----------------------------------------------------------------------------
create or replace function public.audit_occurrence_assignment()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.assigned_to is distinct from old.assigned_to then
    new.assigned_at := now();
    new.assigned_by := auth.uid();
    if new.assigned_to is not null then
      select full_name into new.assigned_to_name
        from public.profiles where id = new.assigned_to;

      -- Notify the assignee (best-effort — table may not exist on old deploys).
      begin
        insert into public.notifications (org_id, user_id, kind, title, body, data)
        values (
          new.org_id, new.assigned_to, 'occurrence.assigned',
          format('Assigned: %s', coalesce(new.ob_number, '#' || new.id)),
          format('%s — %s', new.occurrence_type, left(new.description, 140)),
          jsonb_build_object('occurrence_id', new.id, 'ob_number', new.ob_number)
        );
      exception when undefined_table then null; end;

      -- Audit log.
      begin
        perform public.log_audit_event(
          'occurrence.assign', auth.uid(), new.org_id,
          'occurrences', new.id::text,
          format('%s assigned to %s', coalesce(new.ob_number, '#' || new.id), new.assigned_to_name)
        );
      exception when undefined_function then null; end;
    else
      new.assigned_to_name := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_occ_assignment on public.occurrences;
create trigger trg_occ_assignment
  before update on public.occurrences
  for each row execute function public.audit_occurrence_assignment();
