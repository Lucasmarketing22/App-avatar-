-- =========================================================================
--  App-avatar-  ·  Generaciones de imagen (historial) + Storage de resultados
-- =========================================================================
-- Requiere 0001_init.sql (enum api_key_provider) y 0002 (patron de Storage).
-- =========================================================================

-- Enum de estado de la generacion ----------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'generation_status') then
    create type public.generation_status as enum (
      'pending',
      'processing',
      'succeeded',
      'failed'
    );
  end if;
end$$;

-- =========================================================================
--  Tabla: generations
--  Cada intento de generacion: prompt usado, proveedor, avatar (opcional),
--  estado y ruta del resultado en el bucket privado "generations".
-- =========================================================================
create table if not exists public.generations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  avatar_id        uuid references public.avatars (id) on delete set null,
  provider         public.api_key_provider not null,
  model            text,
  prompt           text not null,
  status           public.generation_status not null default 'pending',
  output_path      text,          -- ruta en el bucket "generations"
  provider_job_id  text,          -- id del job en el proveedor (trazabilidad)
  error            text,
  created_at       timestamptz not null default now()
);

create index if not exists generations_user_id_idx on public.generations (user_id, created_at desc);

alter table public.generations enable row level security;

drop policy if exists "generations_all" on public.generations;
create policy "generations_all" on public.generations
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =========================================================================
--  Storage: bucket privado para los resultados de generacion
--  Convencion de rutas:  <user_id>/<uuid>.png
-- =========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generations',
  'generations',
  false,
  20971520, -- 20 MB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "generations_select_own" on storage.objects;
create policy "generations_select_own" on storage.objects
  for select
  using (
    bucket_id = 'generations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "generations_insert_own" on storage.objects;
create policy "generations_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'generations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "generations_delete_own" on storage.objects;
create policy "generations_delete_own" on storage.objects
  for delete
  using (
    bucket_id = 'generations'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
