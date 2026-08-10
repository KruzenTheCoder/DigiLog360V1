-- ============================================================================
-- DigiLog 360 — Occurrence UPDATE emails
--
-- Assigning an occurrence already emails the reviewer (occurrence.assigned).
-- This adds the other half: once an occurrence is assigned, every subsequent
-- status change or posted note emails the reviewer (and the person who logged
-- it) so nobody has to poll the console to learn what happened.
--
-- Scope guard: ONLY assigned occurrences enqueue. Unassigned ones stay silent,
-- which keeps bulk actions over thousands of historical occurrences from
-- turning into a mail storm.
--
-- Two entry points, deduplicated:
--   • occurrence_updates INSERT — the canonical path (update dialog, bulk
--     actions, mobile board, manager acknowledgement). Carries the note text.
--   • occurrences UPDATE OF status — the safety net for direct status writes.
--     Skipped when a note row for the same occurrence landed moments ago, so
--     the usual "insert note, then update parent" pair sends one email.
--
-- Idempotent and forward-only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Note posted → email (primary path, carries the note)
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_occurrence_update_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  _occ record;
begin
  select id, org_id, assigned_to into _occ
    from public.occurrences where id = new.occurrence_id;

  -- Only assigned occurrences notify.
  if _occ.id is null or _occ.assigned_to is null then
    return new;
  end if;

  insert into public.email_outbox (org_id, event, occurrence_id, payload)
  values (
    _occ.org_id, 'occurrence.updated', _occ.id,
    jsonb_build_object(
      'actor_id',   new.updated_by,
      'actor_name', new.updated_by_name,
      'notes',      new.notes,
      'new_status', new.status
    )
  );
  return new;
end $$;

drop trigger if exists trg_occurrence_updates_enqueue_email on public.occurrence_updates;
create trigger trg_occurrence_updates_enqueue_email
  after insert on public.occurrence_updates
  for each row execute function public.enqueue_occurrence_update_email();

-- ----------------------------------------------------------------------------
-- 2. Direct status change → email (safety net, deduped against the above)
-- ----------------------------------------------------------------------------
create or replace function public.enqueue_occurrence_status_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.assigned_to is null or new.status is not distinct from old.status then
    return new;
  end if;

  -- The apps write the note row first, then patch the parent — both inside a
  -- few milliseconds. If a note already covered this change, stay quiet.
  if exists (
    select 1 from public.occurrence_updates u
     where u.occurrence_id = new.id
       and u.created_at > now() - interval '10 seconds'
  ) then
    return new;
  end if;

  insert into public.email_outbox (org_id, event, occurrence_id, payload)
  values (
    new.org_id, 'occurrence.updated', new.id,
    jsonb_build_object(
      'actor_id',   auth.uid(),
      'old_status', old.status,
      'new_status', new.status
    )
  );
  return new;
end $$;

drop trigger if exists trg_occurrences_status_enqueue_email on public.occurrences;
create trigger trg_occurrences_status_enqueue_email
  after update of status on public.occurrences
  for each row execute function public.enqueue_occurrence_status_email();

-- Supports the dedupe lookup above.
create index if not exists idx_occurrence_updates_occ_created
  on public.occurrence_updates(occurrence_id, created_at desc);
