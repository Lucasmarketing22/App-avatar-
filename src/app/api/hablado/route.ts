import { NextResponse } from 'next/server';

import { enGenero, generoValido } from '@/lib/estudio/genero';
import { componerVideoHablado, durValida, vocesOmni, type Motor, type UsoProducto } from '@/lib/estudio/hablados';
import { guardarConfig, idModeloValido, leerConfig } from '@/lib/hablados';
import { crearVozOmni } from '@/lib/ia/kie';
import { pedirTarea } from '@/lib/tareas';

export const runtime = 'nodejs';

const esUrl = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://');

/**
 * Video hablado: la modelo habla a cámara, con gestos, voz y sonido generados
 * juntos (no es una foto animada). Arranca desde la foto inicial aprobada.
 *  - 'kling3': Kling 3.0 con sonido. La modelo va como elemento (@mila) con sus
 *    fotos de cara y su MUESTRA DE VOZ, así habla con su voz. 3 a 15 s.
 *  - 'omni': Gemini Omni. Voz del catálogo, siempre la misma. 4 a 10 s.
 * Devuelve taskId; se consulta con /api/status (el video se guarda en videos/).
 */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as {
    motor?: string; modeloId?: string; foto?: string; caras?: string[]; texto?: string; idioma?: string;
    escenario?: string; grabacion?: string; gestos?: string; fijo?: string; cuerpo?: string; dur?: number; calidad?: string; vozOmni?: string; producto?: string; pregunta?: string; vozEntrevistador?: string; genero?: string;
  } | null;

  const motor: Motor = b?.motor === 'omni' ? 'omni' : 'kling3';
  // Hombre o mujer: los prompts se escriben para una mujer y se pasan a masculino si hace falta.
  const genero = generoValido(b?.genero);
  if (!esUrl(b?.foto)) return NextResponse.json({ error: 'Falta la foto inicial aprobada.' }, { status: 400 });
  const caras = Array.isArray(b?.caras) ? b!.caras.filter(esUrl).slice(0, 4) : [];
  const texto = typeof b?.texto === 'string' ? b.texto.trim().slice(0, 900) : '';
  if (!texto) return NextResponse.json({ error: 'Falta el guion (lo que dice).' }, { status: 400 });
  const idioma = typeof b?.idioma === 'string' && b.idioma.trim() ? b.idioma.trim().slice(0, 300) : 'English (US), casual';
  const escenario = typeof b?.escenario === 'string' ? b.escenario.trim().slice(0, 400) : '';
  const dur = durValida(motor, Number(b?.dur));
  const pro = b?.calidad === '1080p';
  const producto: UsoProducto | undefined = b?.producto === 'puesto' || b?.producto === 'mano' ? b.producto : undefined;
  // Entrevista (solo UGC): la pregunta la hace alguien fuera de cuadro.
  const pregunta = producto && typeof b?.pregunta === 'string' ? b.pregunta.trim().slice(0, 200) : '';
  const entrevista = pregunta ? { pregunta, voz: b?.vozEntrevistador === 'mujer' ? 'mujer' as const : 'hombre' as const } : undefined;

  const prompt = enGenero(componerVideoHablado({
    motor, dur, texto, idioma, escenario, grabacion: String(b?.grabacion ?? ''),
    gestos: typeof b?.gestos === 'string' ? b.gestos : '', fijo: typeof b?.fijo === 'string' ? b.fijo : '',
    cuerpo: typeof b?.cuerpo === 'string' ? b.cuerpo.slice(0, 200) : '', producto, entrevista,
  }), genero);
  const datos = { tipo: 'video' as const, prompt: texto, dur };

  let result;
  if (motor === 'kling3') {
    if (caras.length < 2) return NextResponse.json({ error: 'Hacen falta al menos 2 fotos de cara de tu modelo (cargalas en su ficha).' }, { status: 400 });
    // La muestra de voz se toma de lo guardado (no de lo que mande el celular).
    const id = idModeloValido(b?.modeloId) ? b!.modeloId! : '';
    const voz = id ? (await leerConfig()).modelos?.[id]?.voz?.url : undefined;
    result = await pedirTarea(request, 'kling-3.0/video', {
      prompt,
      image_urls: [b!.foto],
      sound: true,
      duration: String(dur),
      mode: pro ? 'pro' : 'std',
      multi_shots: false,
      kling_elements: [{
        name: 'mila',
        description: genero === 'hombre' ? 'the man who talks to the camera' : 'the woman who talks to the camera',
        element_input_urls: caras,
        ...(voz ? { element_input_audio_urls: [voz] } : {}),
      }],
    }, datos);
  } else {
    // Voz del catálogo de Omni: se registra una vez por modelo y por voz.
    const voces = vocesOmni(genero);
    const preset = voces.some((v) => v.id === b?.vozOmni) ? b!.vozOmni! : voces[0].id;
    let audioId = '';
    if (idModeloValido(b?.modeloId)) {
      const c = await leerConfig();
      audioId = c.modelos?.[b!.modeloId!]?.omni?.[preset] ?? '';
      if (!audioId) {
        const v = await crearVozOmni(preset, `Hablados ${preset}`, genero === 'hombre'
          ? 'A man with a natural, casual conversational voice: warm, confident, relaxed pace, like talking to a friend in a selfie video. Not a narrator, not an announcer.'
          : 'A young woman in her twenties with a natural, casual conversational voice: warm, a little playful, relaxed pace, like talking to a close friend in a selfie video. Not a narrator, not an announcer.');
        if (!v.ok) return NextResponse.json({ error: v.error }, { status: 502 });
        audioId = v.audioId;
        const modelos = { ...(c.modelos ?? {}) };
        const m = modelos[b!.modeloId!] ?? {};
        modelos[b!.modeloId!] = { ...m, omni: { ...(m.omni ?? {}), [preset]: audioId } };
        await guardarConfig({ ...c, modelos }).catch(() => undefined);
      }
    }
    result = await pedirTarea(request, 'gemini-omni-video', {
      prompt,
      image_urls: [b!.foto, ...caras.slice(0, 2)],
      ...(audioId ? { audio_ids: [audioId] } : {}),
      duration: String(dur),
      aspect_ratio: '9:16',
      resolution: pro ? '1080p' : '720p',
    }, datos);
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ taskId: result.taskId });
}
