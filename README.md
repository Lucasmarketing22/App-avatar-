# App-avatar-

Plataforma **SaaS de creación de contenido UGC con IA** construida con **Next.js
(App Router) + Tailwind CSS + Supabase**. Cada usuario conecta su **propia API
key** de un proveedor externo (**BYOK** – Bring Your Own Key) para generar
imágenes con sus avatares.

## Stack

- **Next.js 14** (App Router, Server Components, Server Actions)
- **TypeScript**
- **Tailwind CSS**
- **Supabase** (Auth + Postgres + RLS) vía `@supabase/ssr`
- Cifrado **AES-256-GCM** para las API keys (server-side)

## Qué incluye este setup

1. **Proyecto configurado**: Next.js + Tailwind + Supabase.
2. **Autenticación con Supabase Auth** (email + contraseña): signup, login,
   logout, callback de confirmación por email, protección de rutas por
   middleware.
3. **Base de datos** (`supabase/migrations/0001_init.sql`) con las tablas:
   `prompt_blocks`, `saved_presets`, `avatars`, `user_api_keys`, incluyendo
   enums, índices, triggers y **Row Level Security** por usuario.
4. **BYOK**: las API keys se guardan **cifradas** (nunca en claro) y solo se
   descifran en el servidor.

## Puesta en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear un proyecto en Supabase y configurar variables

Copia `.env.example` a `.env.local` y completa los valores:

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: en
  *Project Settings → API* del dashboard de Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: en la misma pantalla (solo servidor).
- `ENCRYPTION_KEY`: genera una clave de 32 bytes:

  ```bash
  openssl rand -hex 32
  ```

### 3. Aplicar el esquema

Con la [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase db push          # aplica supabase/migrations
supabase db reset         # (local) aplica migraciones + seed.sql
```

O pega el contenido de `supabase/migrations/0001_init.sql` y luego
`supabase/seed.sql` en el **SQL Editor** del dashboard.

### 4. Ejecutar en desarrollo

```bash
npm run dev
```

Abre <http://localhost:3000>.

## Estructura

```
src/
  app/
    page.tsx                 # Landing
    login/ · signup/         # Autenticación (email)
    auth/
      actions.ts             # Server Actions: login / signup / signOut
      callback/route.ts      # Confirmación por email (PKCE)
    dashboard/page.tsx       # Panel protegido
  components/
    AuthForm.tsx             # Formulario de auth (cliente)
  lib/
    supabase/                # Clientes browser / server / middleware
    encryption.ts            # AES-256-GCM para BYOK
    api-keys.ts              # Guardar / leer API keys cifradas
    database.types.ts        # Tipos del esquema
middleware.ts                # Refresco de sesión + protección de rutas
supabase/
  migrations/0001_init.sql   # Esquema + RLS
  seed.sql                   # Catálogo global de prompt_blocks
```

## Modelo de datos

| Tabla            | Descripción                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `prompt_blocks`  | Bloques del Prompt Builder. `user_id NULL` = catálogo global.      |
| `saved_presets`  | Presets del usuario (bloques seleccionados + prompt cacheado).     |
| `avatars`        | Avatares del usuario (imagen de referencia + id del proveedor).    |
| `user_api_keys`  | API keys BYOK **cifradas**, una por (usuario, proveedor).          |

Todas las tablas tienen **RLS**: cada usuario solo ve y modifica sus datos (el
catálogo global de `prompt_blocks` es de solo lectura para todos).

## Seguridad BYOK

- Las API keys se cifran con **AES-256-GCM** antes de guardarse.
- La clave en claro **nunca** se envía al cliente ni se registra en logs.
- El descifrado ocurre solo en el servidor, justo antes de llamar al proveedor.

## Próximos módulos

Prompt Builder (UI sobre `prompt_blocks`/`saved_presets`), gestión de avatares
con Supabase Storage, y conexión/validación de API keys por proveedor.
