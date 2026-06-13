# Frontend con CSS + tokens y Radix headless; sin Tailwind ni shadcn/ui

El estilado del frontend se hace con **CSS plano gobernado por design tokens** (variables CSS `--ds-*` definidas en `frontend/src/index.css`, derivadas de `DESIGN.md`). No se adopta Tailwind CSS. Los componentes de UI se construyen **a medida** sobre esos tokens (botón, input, card, pill de estado, fila de lista, tab bar… ya documentados en `DESIGN.md` y `.impeccable/design.json`). Para las interacciones complejas que exigen accesibilidad no trivial (Dialog, Popover, DropdownMenu, Tabs…) se usan **primitivas headless de Radix**, sin estilo propio, tematizadas con nuestros tokens. No se usa shadcn/ui.

## Considered Options

- **Tailwind + shadcn/ui**: rápido para CRUD, pero trae una estética reconocible que empuja justo hacia la anti-referencia del producto ("dashboard SaaS genérico"); exige re-tematizar a fondo y añade Tailwind como segunda fuente de verdad de estilos junto a los tokens.
- **CSS + tokens, todo manual**: control total y cero dependencias, pero reimplementar a mano la accesibilidad de modales/menús/foco es costoso y propenso a errores.
- **CSS + tokens + Radix headless (elegido)**: identidad bespoke y calma controlada por los tokens, sin Tailwind ni look genérico, con la accesibilidad/teclado de lo complejo resuelta por Radix.

## Consequences

- Una sola fuente de verdad visual: los tokens `--ds-*` (light/dark, radios, espaciado, motion). Cambiar la marca = cambiar una variable.
- Coherente con `DESIGN.md` y su sidecar `.impeccable/design.json`, que ya especifican los componentes propios.
- Radix entra **solo cuando hace falta** (overlays, menús, foco atrapado); no se añade como librería de componentes con estilo.
- Clerk se integra con su prop `appearance` (variables + elements) mapeada a los mismos tokens; no se mezcla con Tailwind.
- Adoptar Tailwind o shadcn/ui en el futuro sería una desviación explícita de esta decisión.
