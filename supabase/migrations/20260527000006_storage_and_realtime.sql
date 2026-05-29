-- ============================================================================
-- DigiLog 360 — Storage (replaces Azure Blob) & Realtime (replaces SignalR)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Private bucket for occurrence photo evidence.
-- Path convention: occurrence-images/<OB_NUMBER>/<uuid>.<ext>
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'occurrence-images',
  'occurrence-images',
  false,
  5242880,                                -- 5 MB, matching the legacy limit
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Storage object policies (bucket is private; the apps use signed URLs).
drop policy if exists occ_images_read on storage.objects;
create policy occ_images_read on storage.objects
  for select to authenticated
  using (bucket_id = 'occurrence-images');

drop policy if exists occ_images_insert on storage.objects;
create policy occ_images_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'occurrence-images' and owner = auth.uid());

drop policy if exists occ_images_update on storage.objects;
create policy occ_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'occurrence-images' and (owner = auth.uid() or public.is_admin()));

drop policy if exists occ_images_delete on storage.objects;
create policy occ_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'occurrence-images'
    and (owner = auth.uid()
         or public.has_any_role(array['admin','control_room','supervisor']::public.app_role[]))
  );

-- ----------------------------------------------------------------------------
-- Realtime: publish the live tables the admin console subscribes to.
-- ----------------------------------------------------------------------------
alter table public.occurrences        replica identity full;
alter table public.occurrence_updates replica identity full;
alter table public.patrols            replica identity full;
alter table public.checkpoint_scans   replica identity full;

do $$
declare t text;
begin
  foreach t in array array[
    'occurrences','occurrence_updates','occurrence_reports','patrols','checkpoint_scans'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception
      when duplicate_object then null;   -- already published
      when undefined_object then null;   -- publication not present (non-Supabase env)
    end;
  end loop;
end $$;
