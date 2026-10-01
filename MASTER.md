# musa.studio — Sistema de diseño (MASTER)

Identidad: **femenino cálido** — rosa magenta + violeta sobre crema cálido.
Luminoso, prolijo, con personalidad de marca propia (no clon de nadie).

## Tesis
- **Visual**: interfaz luminosa sobre crema cálido; rosa magenta como acento
  principal y violeta como secundario (degradé de marca rosa→violeta); títulos
  en Bricolage Grotesque, texto en DM Sans; tarjetas blancas muy redondeadas
  con sombra suave; barra lateral de íconos en desktop, nav inferior en mobile.
- **Interacción**: transiciones suaves y rápidas (150–250ms, ease-out); hover con
  leve elevación (translateY -1px) y sombra; selección con borde rosa + glow
  (ring rosa-soft); modales como hoja desde abajo (fade + slide). Prohibido:
  rebotes elásticos, parallax, animaciones de layout (width/height).

## Tokens de color
| token | valor | uso |
|---|---|---|
| --bg | #faf6f4 | fondo app (crema cálido) |
| --surface | #ffffff | tarjetas, paneles, modales |
| --surface-2 | #fbf8f7 | paneles secundarios |
| --ink | #231f26 | texto principal |
| --muted | #8a8490 | texto secundario |
| --line | #efe7ec | bordes |
| --rosa | #e5397f | acento principal |
| --rosa-strong | #c81e63 | texto sobre rosa-soft |
| --rosa-soft | #fde6ef | fondos suaves / selección |
| --violeta | #6d47e8 | secundario |
| --violeta-soft | #eee9fe | fondos suaves |
| --grad | linear-gradient(120deg,#e5397f,#6d47e8) | marca / CTA |
| --ok | #1e7a4d | éxito |
| --err | #c0322b | error |
| --err-soft | #fbeceb | fondo error |

## Tipografía
- Títulos / logo: **Bricolage Grotesque** 700/800, letter-spacing -0.02em.
- Texto: **DM Sans** 400/500/600/700.
- Escala: 26 (logo), 20 (h1), 17 (h2 modal), 15 (card title), 14 (body), 13 (meta), 12 (pill).

## Espaciado
Base 4 → 8, 10, 12, 14, 16, 20, 24, 32, 48.

## Radios
sm 10 · md 14 · lg 18 · xl 22 · pill 999.

## Sombras
- sm: 0 1px 3px rgba(35,20,40,.06)
- md: 0 10px 30px rgba(35,20,40,.10)
- rosa (CTA): 0 8px 20px rgba(229,57,127,.30)

## Movimiento
- rápido 150ms, normal 220ms; easing ease-out (cubic-bezier(.2,.7,.3,1)).
- hover tarjeta: translateY(-1px) + sombra md.
- selección: borde rosa 1.5px + ring 3px rosa-soft.
- modal: fade (opacity) + slide up 16px, 220ms.
- respeta prefers-reduced-motion (sin transforms/transiciones).

## Componentes base
- **btn-grad**: fondo degradé, texto blanco, radio 14, sombra rosa, alto 46–48.
- **btn-ghost**: fondo blanco, borde línea, texto tinta, radio 12.
- **scard** (tarjeta de sección): fila con miniatura 42, título + resumen, chevron.
- **chip/opt**: pill; activo = borde rosa + fondo rosa-soft + texto rosa-strong.
- **panel/card**: surface, borde línea, radio xl, sombra sm.
- **rail** (desktop ≥900px): columna 76px de íconos; activo = degradé + sombra rosa.
- **tabbar** (mobile <900px): barra inferior fija con íconos.
- **lightbox**: imagen grande + panel de datos (modelo, fecha) + acciones.
