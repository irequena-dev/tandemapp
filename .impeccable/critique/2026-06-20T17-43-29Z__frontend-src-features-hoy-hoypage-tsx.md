---
target: hoy
total_score: 26
p0_count: 1
p1_count: 3
timestamp: 2026-06-20T17-43-29Z
slug: frontend-src-features-hoy-hoypage-tsx
---
# Crítica de diseño — Tándem · pantalla «Hoy»

**Target:** `frontend/src/features/hoy/HoyPage.tsx` (+ `hoy.css`, `types.ts`)
**Fecha:** 2026-06-20 · **Score total: 26/40 (Acceptable → Good)**

---

## Design Health Score

| # | Heurística | Puntos | Hallazgo clave |
|---|-----------|:---:|-----------|
| 1 | Visibilidad del estado del sistema | 3 | El «Deshacer» aparece/desaparece; el loading es solo texto «Cargando…» sin skeleton. |
| 2 | Concordancia con el mundo real | 3 | Vocabulario fiel (Familia/Hijo/Pauta/Administración), pero «Al día» y «Lista vacía» son copys muertos. |
| 3 | Control y libertad del usuario | 2 | Deshacer solo para la acción del héroe, solo en sesión; las filas del timeline no son accionables. |
| 4 | Consistencia y estándares | 3 | Eje de estados confuso: «Próxima» vs «Pendiente» comparten icono; existe un estilo `--due` que el tipo de datos nunca produce. |
| 5 | Prevención de errores | 2 | Marcar una toma es un tap irreversible sin confirmación; el deshacer se pierde al recargar. |
| 6 | Reconocimiento antes que recuerdo | 3 | Las tarjetas resumen ayudan, pero «Hijos: Al día» está hardcoded (no refleja el dato real). |
| 7 | Flexibilidad y eficiencia | 2 | Sin atajos, sin swipe, sin acciones rápidas en filas. Un solo camino por tarea. |
| 8 | Estética y minimalismo | 3 | Disciplinado en general; la grilla 2×2 y el eyebrow «AHORA» son el exceso. |
| 9 | Recuperación de errores | 2 | El estado de error es una línea de texto sin botón de reintentar ni guía. |
| 10 | Ayuda y documentación | n/a | Fuera de alcance para esta pantalla. |
| **Total** | | **26/40** | **Acceptable — base sólida, mejoras significativas** |

---

## Anti-Patterns Verdict

**¿Parece hecho por IA?** En gran medida no. No hay side-stripes, ni gradient-text, ni glassmorphism, ni hero-metric template, ni scaffolding numerado. La paleta greige+sage y el sistema tipográfico restrained se leen como trabajo con criterio, no como un volcado de v0.

Pero sobreviven **dos tells**:

1. **La grilla 2×2 de tarjetas resumen** — cuatro tiles homogéneos (icono-en-cuadro-redondeado + label muted + valor bold), sin jerarquía narrativa. Es el cliché de «identical card grid» que los diseñadores de Linear/Stripe/Notion han aprendido a desconfiar.
2. **El eyebrow «AHORA» en mayúsculas con tracking** — es el kicker de IA canónico, y como es el *único* eyebrow de la pantalla se lee como prestado, no como sistema. Si existiera un eyebrow en cada sección sería ritmo; solo, es decoración.

**Deterministic scan:** el detector (`detect.mjs`) devolvió **0 hallazgos** sobre `HoyPage.tsx`. Coincide con la revisión LLM en que no hay bans estructurales (side-stripe, gradient-text, glassmorphism). Nada que el detector atrape que la revisión haya perdido.

**Contraste — corrección de falso positivo:** la revisión marcó `--ds-attn-ink (#8a4521)` sobre `--ds-attn-bg (#f3e2d3)` como ~4.0:1 (fallo AA). Verificado: es **5.63:1**, pasa AA. El par en dark `#e6a878`/`#38291d` es **6.81:1**. `muted` sobre `bg`: 4.67:1 (pasa). **No hay fallos de contraste reales** en ninguna de las dos paletas.

---

## Overall Impression

El héroe «Ahora» es el acierto de la pantalla: una máquina de estados calm↔urgent que comunica por tres canales a la vez (borde, fondo, eyebrow) — exactamente «state-is-never-color-alone» hecho bien, y flat-at-rest impecable. La disciplina del sistema (tokens, tabular-nums, foco visible) está por encima de la media. **La mayor oportunidad está en el tercio inferior:** la grilla 2×2 de resumen es donde se filtra la carga cognitiva, donde aparece el tell de IA y donde se acumulan los problemas de estados/correctitud (Hijos hardcoded, eje de status confuso, filas no accionables).

---

## What's Working

1. **El state machine del héroe.** Calm vs. urgent expresado por tres canales reforzantes (tinte de borde, fill de fondo, cambio de color del eyebrow). Es el mejor momento de la pantalla y el patrón a imitar.
2. **Flat-at-rest honrado casi a la perfección.** Las tarjetas en reposo usan 1px border + escalón tonal, cero sombra; las sombras del sistema están reservadas a capas flotantes. Disciplina rara.
3. **Tabular figures en los horarios** (`ds-nums` + `font-variant-numeric`) — detalle menudo, correcto, mantiene la columna de tiempos alineada al escanear.

---

## Priority Issues

### [P0] «Hijos: Al día» está hardcoded — el sistema miente
- **Qué:** `hoy-card__value` de Hijos es el literal `"Al día"`, mientras `types.ts` declara `children_status: string`.
- **Por qué importa:** bug de correctitud que miente silenciosamente. Un padre que ojea confiado en que un Hijo está «Al día» puede estar mirando una fabricación. Viola la heurística 6 y la promesa central del producto (consulta confiable).
- **Fix:** renderizar `summary.children_status`. Si el backend no define sus valores, definirlos (`al_dia` / `revision_vencida` / `seguimiento`) y emparejar cada uno con token + icono (state-is-never-color-alone).
- **Comando:** `$impeccable harden` (edge cases / correctitud de datos) o `$impeccable clarify` (el copy muerto).

### [P1] Marcar una toma es irreversible, con deshacer solo de sesión
- **Qué:** el tap del héroe muta el servidor; el deshacer depende de `lastAdminId`/`eventDone` en estado React, perdido al recargar o al evictar la pestaña.
- **Por qué importa:** taps distractivos a una mano y ~3s son justo el régimen donde ocurren mis-taps; una PWA puede morir a mitad de sesión. La marca silenciosa y permanente rompe la promesa de «trustworthy».
- **Fix:** (a) acción optimista con ventana de deshacer persistente (localStorage) ~10s, o (b) confirmar dosis pero no eventos, o (c) exponer una entrada de deshacer server-side vía el timeline.
- **Comando:** `$impeccable harden`.

### [P1] Las filas del timeline no son accionables y su tap target es ambiguo
- **Qué:** `.hoy-tl-item` es un `div`, no un link/botón; no hay camino de una dosis del timeline a su Pauta, ni de un evento a su detalle. El target mide ~44px (borderline).
- **Por qué importa:** falla recognition-over-recall — ver «Paracetamol · 14:00 · Pendiente» sin poder tap-through obliga a navegar por la tab bar.
- **Fix:** convertir cada item en `<Link>` a `/pautas/:id` o `/eventos/:id`, o añadir acción inline («Marcar») en filas `pending`/`upcoming`. Garantizar ≥44px de alto de fila.
- **Comando:** `$impeccable layout` (tap targets) + `$impeccable harden` (interactividad).

### [P1] El eje de estados del timeline está confundido
- **Qué:** el tipo define `status: 'done' | 'upcoming' | 'pending'`, pero el CSS define `--done`, `--pending`, **y `--due`** (que el tipo nunca produce). `statusLabel()` mapea `upcoming`→«Próxima» y `pending`→«Pendiente» con el *mismo* icono y casi el mismo copy.
- **Por qué importa:** escaneando no se distinguen «Próxima» de «Pendiente»; y `--due` es código muerto que sugiere un estado «vencido» que el dato no entrega — justo el estado más importante que falta para una app de logística de crianza.
- **Fix:** colapsar a dos estados reales (`done`/`pending`), o implementar `due`/overdue con el token clay y un icono distinto (triángulo de alerta). Eliminar la regla CSS muerta.
- **Comando:** `$impeccable clarify` (semántica de estados).

### [P2] La grilla 2×2 de resumen es el momento cliché de IA
- **Qué:** cuatro tarjetas idénticas (icon-chip + label muted + valor bold), sin jerarquía, misma masa visual.
- **Por qué importa:** se lee como plantilla prestada y desperdicia la oportunidad de que «necesita atención» (p. ej. `shopping_pending_count > 0`) suba por encima de los silenciosos.
- **Fix:** romper la grilla. Que Compra, con pendientes, sea una fila horizontal «N por comprar →» tintada de warning/clay; mantener Pautas/Hijos/Próxima cita como lista apilada más silenciosa. Objetivo: que no haya dos tiles idénticos cuando su contenido no lo es.
- **Comando:** `$impeccable distill` o `$impeccable layout`.

---

## Persona Red Flags

### Casey — móvil, a una mano, distraído
- Tras marcar, el «Deshacer» aparece junto al botón primario en una fila `flex-wrap` — dos botones `btn--sm` fáciles de mis-tap con el pulgar.
- Las 4 tarjetas resumen quedan **bajo el fold** si el timeline está poblado; llegar a «Compra» a una mano exige estirar o re-agarrar. La ojeada principal está bien; las acciones secundarias no son thumb-first.
- Las status pills (`padding: 4px 10px` + `.8125rem`) miden ~24–26px de alto, bajo el mínimo de 44px; aunque no son tappables, fijan una densidad visual que invita mis-taps en filas adyacentes.
- El título de «Próxima cita» no tiene `line-clamp`: un título largo rompe la altura de la fila de la grilla y desalinea el tile hermano.

### Sam — teclado / lector de pantalla
- `.hoy-tl-item` es un `div` y la status pill un `span` sin `role`/`aria-label`; el SR lee «14:00 Paracetamol Pendiente» plano. Los SVG de Check/Clock no están marcados `aria-hidden`.
- El eyebrow visible «Ahora» + el `aria-label="Ahora"` del `<section>` generan duplicación «Ahora, …».
- Los estados loading y error son `<p>` sin `role="status"`/`role="alert"`: el SR no anuncia proactivamente que falló la carga.
- **Foco visible:** definido en `.hoy-card` pero hay que verificar el ring en los botones del héroe (depende de una regla global de `button` que no es evidente en `index.css`). Revisar.
- **Contraste:** verificado OK en ambas paletas (sin fallos reales — el claim de 4.0:1 del attn-ink fue un falso positivo).

### Riley — stress tester / edge cases
- **Timeline vacío:** `TimelineSection` devuelve `null`; la sección desaparece sin copy de empty state («Hoy está tranquilo»). El `gap` del padre permanece, dejando un hueco silencioso.
- **Timeline con muchas entradas:** sin virtualización, sin `max-height`, sin scroll containment — un día con 30 dosis hace la página muy larga y empuja el resumen lejos.
- **Strings largos:** `.hoy-tl-item__label` y `.hoy-card__value` sin `overflow`/`line-clamp` → rompen la grilla.
- **Error de red durante la acción:** el mutate del héroe no tiene `onError`; un fallo deja el botón re-habilitado sin feedback (hay un sistema de toasts en el repo — no está cableado aquí).
- **`children_status: string`** es un contract smell (ver P0).

---

## Minor Observations

- Comentario CSS «Summary cards ('Más cosas')» alude a un header eliminado — dead comment.
- `--ds-accent` está aliasado a `--ds-primary`; los cuatro icon-chips sage idénticos refuerzan la sensación de «grilla idéntica».
- `.hoy-hero__calm` se reutiliza como estilo de loading/error — semánticamente raro y pierde la distinción visual de esos estados.
- El `<h2>` «Hoy» del timeline **duplica el texto del `<h1>`** → outline «Hoy / héroe / Hoy / items». Renombrar a «Agenda de hoy» o «Hoy por hora».
- `prefers-reduced-motion` se honra globalmente (correcto); el único motion es la transición de 120ms del bg de la tarjeta.
- Paridad dark-mode limpia desde tokens; el par attn en dark (6.81:1) irónicamente mejor que el de light (que ya pasa).

---

## Questions to Consider

1. **¿Necesita «Hoy» una grilla de resumen?** El timeline ya responde «qué pasa hoy»; las cuatro tarjetas sobre todo repiten conteos a un tap de distancia. ¿Y si el resumen fuera una sola línea silenciosa — «2 compras · 3 pautas activas · próxima cita el jue» — y la tab bar cargara el resto? La grilla quizá cueste más atención de la que gana.
2. **¿Se gana el eyebrow «Ahora» su tracking en mayúsculas?** Es el único eyebrow, así que se lee decoración, no sistema. Si se compromete a eyebrows en cada sección («Ahora»/«Agenda»/«Más»), se vuelven ritmo.
3. **¿Qué significa «Pendiente» que no signifique «Próxima»?** El eje tiene tres nombres para dos tratamientos visuales y cero representación de *vencido* — el estado que una app de logística de crianza no puede ocultar. Si solo pudieras conservar dos estados en una fila del timeline, ¿cuáles dos cambian realmente el comportamiento de un padre?
