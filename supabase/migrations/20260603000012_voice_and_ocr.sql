-- ============================================================================
-- DigiLog 360 — Voice notes + OCR artefacts
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Storage bucket for voice notes (private). Path: <org_slug>/<OB>/<uuid>.m4a
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'occurrence-voice-notes',
  'occurrence-voice-notes',
  false,
  10485760, -- 10 MB
  array['audio/mp4','audio/m4a','audio/aac','audio/webm','audio/ogg','audio/mpeg']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists voice_read on storage.objects;
create policy voice_read on storage.objects
  for select to authenticated using (
    bucket_id = 'occurrence-voice-notes'
    and (
      coalesce(public.is_super_user(), false)
      or public.storage_path_org_slug(name) = public.current_org_slug()
    )
  );

drop policy if exists voice_insert on storage.objects;
create policy voice_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'occurrence-voice-notes'
    and owner = auth.uid()
    and (
      coalesce(public.is_super_user(), false)
      or public.storage_path_org_slug(name) = public.current_org_slug()
    )
  );

drop policy if exists voice_delete on storage.objects;
create policy voice_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'occurrence-voice-notes'
    and (
      coalesce(public.is_super_user(), false)
      or owner = auth.uid()
      or coalesce(public.is_admin(), false)
    )
  );
