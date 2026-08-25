-- =========================================================================
--  App-avatar-  ·  Esquema inicial
--  Plataforma SaaS de creacion de contenido UGC con IA (BYOK)
-- =========================================================================
-- Ejecutar con Supabase CLI:  supabase db push
-- o pegar en el SQL Editor del dashboard de Supabase.
-- =========================================================================

-- Extensiones -------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- Enums -------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'prompt_block_category') then
    create type public.prompt_block_category as enum (
      'accion',
      'expresion',
      'encuadre',
      'locacion',
      'iluminacion',
      'outfit',
      'estilo'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'api_key_provider') then
    create type public.api_key_provider as enum (
      'fal',
      'higgsfield',
      'replicate'
    );
  end if;
end$$;

-- Utilidad: trigger para mantener updated_at ------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
--  Tabla: prompt_blocks
--  Bloques de prompt (biblioteca del Prompt Builder). user_id NULL = catalogo
--  global compartido por todos; user_id != NULL = bloque personalizado.
-- =========================================================================
create table if not exists public.prompt_blocks (
  id              uuid primary key default gen_random_uuid(),
  category        public.prompt_block_category not null,
  label           text not null,
  prompt_fragment text not null,
  is_custom       boolean not null default false,
  user_id         uuid references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),

  -- Coherencia: un bloque custom debe tener dueño; uno de catalogo no.
  constraint prompt_blocks_custom_ownership_chk
    check ((is_custom and user_id is not null) or (not is_custom and user_id is null))
);

create index if not exists prompt_blocks_category_idx on public.prompt_blocks (category);
create index if not exists prompt_blocks_user_id_idx  on public.prompt_blocks (user_id);

-- =========================================================================
--  Tabla: saved_presets
--  Presets guardados por el usuario (seleccion de bloques + prompt cacheado).
-- =========================================================================
create table if not exists public.saved_presets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  block_ids         uuid[] not null default '{}',
  final_prompt_text text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists saved_presets_user_id_idx on public.saved_presets (user_id);

drop trigger if exists saved_presets_set_updated_at on public.saved_presets;
create trigger saved_presets_set_updated_at
  before update on public.saved_presets
  for each row execute function public.set_updated_at();

-- =========================================================================
--  Tabla: avatars
--  Avatares del usuario (imagen de referencia + id en el proveedor externo).
-- =========================================================================
create table if not exists public.avatars (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  name                  text not null,
  reference_image_url   text,
  provider_reference_id text,
  created_at            timestamptz not null default now()
);

create index if not exists avatars_user_id_idx on public.avatars (user_id);

-- =========================================================================
--  Tabla: user_api_keys
--  API keys BYOK de proveedores externos, CIFRADAS (AES-256-GCM en la app).
--  Una clave por (usuario, proveedor).
-- =========================================================================
create table if not exists public.user_api_keys (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  provider          public.api_key_provider not null,
  api_key_encrypted text not null,
  is_valid          boolean not null default false,
  created_at        timestamptz not null default now(),

  constraint user_api_keys_user_provider_uniq unique (user_id, provider)
);

create index if not exists user_api_keys_user_id_idx on public.user_api_keys (user_id);

-- =========================================================================
--  Row Level Security
-- =========================================================================
alter table public.prompt_blocks  enable row level security;
alter table public.saved_presets  enable row level security;
alter table public.avatars        enable row level security;
alter table public.user_api_keys  enable row level security;

-- --- prompt_blocks -------------------------------------------------------
-- Lectura: catalogo global (user_id null) o los propios bloques custom.
drop policy if exists "prompt_blocks_select" on public.prompt_blocks;
create policy "prompt_blocks_select" on public.prompt_blocks
  for select
  using (user_id is null or user_id = auth.uid());

-- Insert: solo bloques custom propios.
drop policy if exists "prompt_blocks_insert" on public.prompt_blocks;
create policy "prompt_blocks_insert" on public.prompt_blocks
  for insert
  with check (is_custom and user_id = auth.uid());

-- Update: solo los propios.
drop policy if exists "prompt_blocks_update" on public.prompt_blocks;
create policy "prompt_blocks_update" on public.prompt_blocks
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Delete: solo los propios.
drop policy if exists "prompt_blocks_delete" on public.prompt_blocks;
create policy "prompt_blocks_delete" on public.prompt_blocks
  for delete
  using (user_id = auth.uid());

-- --- saved_presets -------------------------------------------------------
drop policy if exists "saved_presets_all" on public.saved_presets;
create policy "saved_presets_all" on public.saved_presets
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --- avatars -------------------------------------------------------------
drop policy if exists "avatars_all" on public.avatars;
create policy "avatars_all" on public.avatars
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --- user_api_keys -------------------------------------------------------
drop policy if exists "user_api_keys_all" on public.user_api_keys;
create policy "user_api_keys_all" on public.user_api_keys
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
