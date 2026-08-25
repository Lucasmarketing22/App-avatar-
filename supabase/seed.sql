-- =========================================================================
--  Seed del catalogo global de prompt_blocks (user_id = null, is_custom = false)
--  Ejecutar despues de 0001_init.sql.  supabase db reset  lo aplica solo.
-- =========================================================================

insert into public.prompt_blocks (category, label, prompt_fragment, is_custom, user_id) values
  -- accion
  ('accion',      'Caminando por la calle',   'walking down a busy city street',                    false, null),
  ('accion',      'Sosteniendo el producto',  'holding the product up towards the camera',          false, null),
  ('accion',      'Tomando cafe',             'sipping a cup of coffee',                             false, null),
  -- expresion
  ('expresion',   'Sonrisa natural',          'with a natural, genuine smile',                       false, null),
  ('expresion',   'Sorprendida',              'with a surprised, wow expression',                    false, null),
  ('expresion',   'Seria y confiada',         'with a serious, confident look',                      false, null),
  -- encuadre
  ('encuadre',    'Primer plano',             'close-up shot, face and shoulders in frame',          false, null),
  ('encuadre',    'Plano medio',              'medium shot, waist up',                               false, null),
  ('encuadre',    'Cuerpo completo',          'full body shot',                                      false, null),
  -- locacion
  ('locacion',    'Cafeteria acogedora',      'inside a cozy coffee shop',                           false, null),
  ('locacion',    'Dormitorio con luz suave', 'in a bedroom with soft natural light',                false, null),
  ('locacion',    'Calle urbana',             'on an urban city street background',                  false, null),
  -- iluminacion
  ('iluminacion', 'Luz natural suave',        'soft natural daylight',                               false, null),
  ('iluminacion', 'Golden hour',              'warm golden hour lighting',                           false, null),
  ('iluminacion', 'Estudio profesional',      'professional studio lighting, softbox',               false, null),
  -- outfit
  ('outfit',      'Casual streetwear',        'wearing casual streetwear',                           false, null),
  ('outfit',      'Elegante formal',          'wearing an elegant formal outfit',                    false, null),
  ('outfit',      'Ropa deportiva',           'wearing athletic sportswear',                         false, null),
  -- estilo
  ('estilo',      'Foto de iPhone / UGC',     'shot on iPhone, authentic UGC style, slightly grainy', false, null),
  ('estilo',      'Editorial de moda',        'high-end fashion editorial style',                    false, null),
  ('estilo',      'Cinematografico',          'cinematic color grading, shallow depth of field',     false, null)
on conflict do nothing;
