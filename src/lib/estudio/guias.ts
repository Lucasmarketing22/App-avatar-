/** Guías paso a paso de cada sección (se leen en pantalla y en voz alta). */
export type GuiaId = 'crear' | 'clonar' | 'viral' | 'motion' | 'lienzo' | 'voz' | 'galeria';

export const GUIAS: Record<GuiaId, { titulo: string; pasos: string[] }> = {
  crear: {
    titulo: 'Crear fotos',
    pasos: [
      'Arriba, en Personaje, tocá la modelo con la que querés crear. Tocándola de nuevo abrís su ficha: ahí cargás sus fotos de cara, de cuerpo y sus medidas.',
      'Si querés, elegí vestuario, peinado, pose, escena o luz en las cajitas. Lo que no elijas lo decide la inteligencia artificial.',
      'Escribí en el cuadro de texto lo que querés ver. Por ejemplo: en bikini en la playa, al atardecer.',
      'Elegí el modelo de inteligencia artificial, el formato y la cantidad de fotos. Abajo del botón ves cuánto cuesta.',
      'Tocá Generar imagen y esperá el círculo que gira. Cuando termina, la foto aparece abajo.',
      'Con la foto lista podés: Guardarla, Publicarla, Mejorarla, hacer Variar para sacar parecidas, o tocar Sesión de fotos para crear varias tomas del mismo lugar y ropa.',
    ],
  },
  clonar: {
    titulo: 'Clonar una foto y cambiarle la cara',
    pasos: [
      'En Crear, abajo de las referencias, subí la foto que querés copiar. Esa es la imagen 1.',
      'Asegurate de que tu modelo esté elegida arriba, en Personaje: su cara es la que se va a poner.',
      'Tocá el botón Clonar foto más cambiar cara: se escribe solo el pedido.',
      'Tocá Generar imagen. Sale la misma foto, con la misma escena, pose, luz y ropa, pero con la cara de tu modelo.',
      'Si no te convence, tocá Variar para probar de nuevo con el mismo pedido.',
    ],
  },
  viral: {
    titulo: 'Recrear un video viral',
    pasos: [
      'Paso uno: elegí qué tipo de video es. Baile, hablando a cámara, gestos sensuales o primer plano de la cara.',
      'Paso dos: subí el video viral. Viene marcado quitarle el sonido, así no usás música con derechos de autor.',
      'Con el deslizador elegí desde qué segundo arranca el video. La foto de tu modelo va a empezar exactamente en esa toma.',
      'Paso tres: tocá Crear foto. Comparala con el video: si no coincide, tocá Crear otra. Cuando te guste, tocala para aprobarla.',
      'Paso cuatro: elegí el motor. Kling 3.0 es el más fiel. Tocá Crear video y esperá unos minutos: podés seguir usando la app.',
      'Cuando termina, tocá Guardar para bajarlo al celu, o Publicar para mandarlo a tus redes.',
    ],
  },
  motion: {
    titulo: 'Motion control',
    pasos: [
      'Elegí el modo: Mover a mi modelo copia los movimientos del video en tu foto. Reemplazar persona deja el video original y cambia a la chica por tu modelo.',
      'Subí el video a recrear. Dejá marcado quitarle el sonido.',
      'Dejá activado Mismo escenario que el video: primero se crea tu modelo en ese lugar y postura, y después se anima.',
      'Elegí la foto de tu modelo. Si querés, escribí cambios, como la ropa o el pelo.',
      'Elegí la calidad, mirá el costo y tocá Generar video. Va a aparecer en tu galería, en Videos.',
      'Tip: para más control, paso a paso, usá Recrear viral o el Lienzo.',
    ],
  },
  lienzo: {
    titulo: 'El lienzo',
    pasos: [
      'El lienzo es para armar tu propio circuito con cajas conectadas. Lo más fácil es tocar Plantilla: arma todo para hacer motion exacto.',
      'Mové el lienzo arrastrando con un dedo, y hacé zoom con dos dedos. Las cajas se mueven arrastrándolas desde el título.',
      'Para conectar, arrastrá desde el puntito de color de la derecha de una caja hasta el puntito de la izquierda de otra. Para desconectar, tocá el puntito de la izquierda.',
      'Las cajas que crean con inteligencia artificial tienen un botón con un triángulo y muestran el costo. Nada se gasta hasta que lo tocás.',
      'En Foto IA tocá la foto que te guste para aprobarla: solo la aprobada pasa a la caja siguiente.',
      'Con el botón de los dos cuadraditos duplicás una caja para probar variantes. Arriba, en la carpeta, podés tener varios lienzos con nombre.',
      'Para Mila hablando: conectá una foto y una caja Audio. En Audio podés subir un video de Flow: la app le saca la voz.',
    ],
  },
  voz: {
    titulo: 'Voz de tu modelo',
    pasos: [
      'Arriba ves la voz que tiene elegida tu modelo.',
      'En Biblioteca buscás voces, las escuchás con el triángulo y tocás Elegir. Elegir es gratis.',
      'En Crear voz describís cómo querés que suene y te arma tres opciones. Esto gasta saldo de la cuenta de API de Fish Audio.',
      'Abajo escribís lo que querés que diga y tocás Generar. Los audios quedan en Mis audios.',
      'Si hacés la voz con Flow, no necesitás esta sección: usá la caja Audio del Lienzo y subí el video de Flow.',
    ],
  },
  galeria: {
    titulo: 'Tu galería',
    pasos: [
      'En Fotos están todas tus creaciones. Tocá una para verla en grande y ver más opciones.',
      'En Videos están tus videos. Ojo: se borran solos a los tres días, así que guardá los que quieras conservar.',
      'Para guardar en el celu tocá Guardar y después Guardar en Fotos: en el menú del iPhone elegí Guardar video o Guardar imagen.',
      'Para subir a tus redes tocá Publicar: te arma el texto con hashtags y abre TikTok, Instagram o LeadConnector.',
      'Arriba ves cuánto espacio estás usando.',
    ],
  },
};
