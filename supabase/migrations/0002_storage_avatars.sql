-- =========================================================================
--  App-avatar-  ·  Storage para imagenes de referencia de avatares
-- =========================================================================
-- Crea un bucket privado y policies para que cada usuario solo acceda a sus
-- archivos. Convencion de rutas:  <user_id>/<uuid>.<ext>
-- =========================================================================

-- Bucket privado (no public). Limite de 10 MB y solo imagenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatar-references',
  'avatar-references',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Policies sobre storage.objects, restringidas a la primera carpeta = user_id.
drop policy if exists "avatar_refs_select_own" on storage.objects;
create policy "avatar_refs_select_own" on storage.objects
  for select
  using (
    bucket_id = 'avatar-references'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar_refs_insert_own" on storage.objects;
create policy "avatar_refs_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'avatar-references'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar_refs_update_own" on storage.objects;
create policy "avatar_refs_update_own" on storage.objects
  for update
  using (
    bucket_id = 'avatar-references'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar_refs_delete_own" on storage.objects;
create policy "avatar_refs_delete_own" on storage.objects
  for delete
  using (
    bucket_id = 'avatar-references'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
