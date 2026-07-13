-- ============================================================================
-- DigiLog 360 — Occurrence voice notes (playable audio evidence)
--
-- Mirrors public.occurrence_images: a guard records a short clip on the Log
-- Occurrence form (mobile or web) and it attaches to the occurrence as a
-- playable voice note — exactly like a photo. The audio bytes live in the
-- existing private `occurrence-voice-notes` storage bucket (see migration
-- 20260603000012); this table records which clip belongs to which occurrence.
-- ============================================================================

create table if not exists public.occurrence_voice_notes (
  id                bigint generated always as identity primary key,
  occurrence_id     bigint not null references public.occurrences(id) on delete cascade,
  ob_number         text,
  storage_path      text not null,           -- path within the 'occurrence-voice-notes' bucket
  duration_ms       integer,                 -- clip length, best-effort (null if unknown)
  recorded_by       uuid references public.profiles(id) on delete set null,
  recorded_by_name  text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_voice_notes_occurrence
  on public.occurrence_voice_notes(occurrence_id);

alter table public.occurrence_voice_notes enable row level security;

-- Read: admins, plus anyone who can see the parent occurrence (its logger or
-- someone at the same site). Mirrors occurrence_images images_select.
drop policy if exists voice_notes_select on public.occurrence_voice_notes;
create policy voice_notes_select on public.occurrence_voice_notes
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.occurrences o
      where o.id = occurrence_id
        and (o.logged_by = auth.uid() or o.site_id = public.current_site_id())
    )
  );

-- Insert: the recorder attaches their own clip (or an admin on their behalf).
drop policy if exists voice_notes_insert on public.occurrence_voice_notes;
create policy voice_notes_insert on public.occurrence_voice_notes
  for insert to authenticated with check (
    public.is_admin() or recorded_by = auth.uid()
  );

-- Delete: admins, the recorder, or reviewers (control room / supervisor).
drop policy if exists voice_notes_delete on public.occurrence_voice_notes;
create policy voice_notes_delete on public.occurrence_voice_notes
  for delete to authenticated using (
    public.is_admin()
    or recorded_by = auth.uid()
    or public.has_any_role(array['control_room','supervisor']::public.app_role[])
  );

-- ----------------------------------------------------------------------------
-- Storage policies — realign the occurrence-voice-notes bucket to mirror the
-- occurrence-images bucket (owner-based insert, broad authenticated read so
-- reviewers can mint signed URLs). The original policies (migration
-- 20260603000012) required an <org_slug>/… path prefix, which the photo flow
-- doesn't use; matching images keeps the client path convention identical:
--   occurrence-voice-notes/<OB_NUMBER>/<uuid>.m4a
-- ----------------------------------------------------------------------------
drop policy if exists voice_read on storage.objects;
drop policy if exists voice_insert on storage.objects;
drop policy if exists voice_delete on storage.objects;

drop policy if exists occ_voice_select on storage.objects;
create policy occ_voice_select on storage.objects
  for select to authenticated
  using (bucket_id = 'occurrence-voice-notes');

drop policy if exists occ_voice_insert on storage.objects;
create policy occ_voice_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'occurrence-voice-notes' and owner = auth.uid());

drop policy if exists occ_voice_update on storage.objects;
create policy occ_voice_update on storage.objects
  for update to authenticated
  using (bucket_id = 'occurrence-voice-notes' and (owner = auth.uid() or public.is_admin()));

drop policy if exists occ_voice_delete on storage.objects;
create policy occ_voice_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'occurrence-voice-notes'
    and (owner = auth.uid()
         or public.has_any_role(array['admin','control_room','supervisor']::public.app_role[]))
  );
