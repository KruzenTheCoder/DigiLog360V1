-- ============================================================================
-- DigiLog 360 — Storage bucket for org branding assets (uploaded Netstream
-- logo override, future custom org logos, etc.).
--
-- Public read so we can render the image straight from the URL without
-- signing on every page load. Write restricted to super_user + admin.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Anyone authenticated can read public branding (the bucket is public anyway,
-- this just makes the policy explicit).
drop policy if exists branding_read on storage.objects;
create policy branding_read on storage.objects
  for select to authenticated using (bucket_id = 'branding');

-- Upload / replace / delete: super_user or admin.
drop policy if exists branding_write on storage.objects;
create policy branding_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'branding' and (
      public.is_super_user() or public.is_admin()
    )
  )
  with check (
    bucket_id = 'branding' and (
      public.is_super_user() or public.is_admin()
    )
  );
