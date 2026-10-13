# musa.studio

Estudio para crear imágenes de un personaje virtual con IA.

## Etapa 1 — Motor de generación (Kie.ai)

Qué hace: escribís una frase → genera una imagen con IA → la guarda en tu
almacenamiento. Opcional: sumar una foto de referencia.

### Variables de entorno (se cargan en Vercel → Settings → Environment Variables)

- `KIE_API_KEY` — clave de Kie.ai (https://kie.ai/api-key).
- `APP_PASSWORD` — contraseña única para entrar a la app.
- `BLOB_READ_WRITE_TOKEN` — almacenamiento (Vercel Blob). Lo agrega Vercel solo
  al conectar un Blob Store al proyecto.
- `FISH_AUDIO_API_KEY` (opcional) — voces de Fish Audio. Sin esta clave la
  sección Voz no aparece.
- `CRON_SECRET` (opcional) — protege la limpieza diaria de videos.

### Cómo probarla

1. Abrí la app publicada e ingresá con `APP_PASSWORD`.
2. Escribí una frase (mejor en inglés) y tocá "Generar imagen".
3. Esperá hasta ~1 minuto: aparece la imagen generada y guardada.

### Notas técnicas

- La clave de Kie vive solo en el servidor (nunca en el navegador).
- La generación es asíncrona: se crea la tarea y se consulta el estado con
  polling hasta que termina (éxito/fallo), con mensajes de error en español.
- Modelos verificados en docs.kie.ai: `google/nano-banana` (texto→imagen) y
  `google/nano-banana-edit` (con imagen de referencia, campo `image_urls`).
