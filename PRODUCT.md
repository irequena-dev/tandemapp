# Product

## Register

product

## Users

**Miembros** of a **Familia** — parents, grandparents, a niñera — sharing the logistical mental load of raising one or more **Hijos**. They are typically tired, multitasking, and using the app one-handed on a phone between other things (cooking, holding a child, at the pharmacy, in a waiting room), under variable lighting. They are not power users and have no time to learn an interface; several Miembros touch the same data and must never step on each other.

Two complementary contexts of use:
- **Hands-free input**: dictating to Claude's mobile app, which writes structured data via a remote MCP server. The PWA is *not* the input path here.
- **Visual consultation/validation (the PWA, what we design)**: quick glances and taps to check, tick off, or correct data — what's left to buy, what **Talla** fits each Hijo now, when the next **Administración** of a **Pauta** is due and who gave it, what's on the agenda today.

## Product Purpose

Tándem (brand "Tándem"; slug `tandem`) reduces the constant logistical mental load of parenting by giving each Familia one shared, always-current place for the boring-but-critical facts: the **Ítems de compra**, **Medidas** and **Tallas**, **Visitas médicas** and **Pautas**, and **Eventos**. Success is a Miembro opening the PWA, getting the answer or confirming the action in a few seconds, and closing it — with the confidence that the rest of the Familia sees the same truth. The product earns its place by lowering stress, not by adding another app to manage.

## Brand Personality

Calm and reassuring. Quiet confidence — the interface never shouts, never nags, never gamifies. Three words: **calm, trustworthy, effortless**. Voice is plain, warm, and direct in Spanish (the ubiquitous language); it speaks to a capable adult, not a patient being managed. The emotional goal is relief: "it's handled, I can see it, I can stop holding it in my head."

## Anti-references

- **Generic SaaS dashboard** — no cold corporate admin-panel look, no navy/gray enterprise palette, no wall of hero-metric cards or KPI tiles. This is a home tool, not a business intelligence console.
- **Childish / cutesy** — no baby pastels, cartoon mascots, rounded-everything "kids app" clichés, or playful illustrations. It's about children but used by adults; treat them as adults.
- **Cluttered productivity app** — no dense feature-stuffed todo/calendar surfaces that overwhelm. Resist the urge to show everything; surface what matters now and let the rest recede.

## Design Principles

1. **One-handed, low-attention first.** Every primary action reachable by thumb, large tap targets, legible in sunlight or a dim bedroom. Assume the user has ~3 seconds and one free hand.
2. **Reduce load, never add it.** Calm by default; no badges screaming for attention, no streaks, no manufactured urgency. The only things that draw the eye are the things that genuinely need a Miembro now (a due Administración, an Ítem still pending).
3. **Answer at a glance.** The core job is consult-and-confirm, so state must be instantly readable: pending vs. comprado, activa vs. finalizada, due now vs. later. Optimize the read path before the write path.
4. **Speak the domain faithfully.** Use the `CONTEXT.md` ubiquitous language in the UI (Familia, Hijo, Medida, Talla, Ítem de compra, Evento, Visita médica, Pauta, Administración). The interface should teach the model the team already shares, not invent synonyms.
5. **Honest, optimistic feedback.** "Real time" is optimistic updates + refetch, not push. Reflect actions immediately, but never fake certainty the backend hasn't confirmed; corrections are always possible and never punished.

## Accessibility & Inclusion

- **WCAG 2.1 AA** as the baseline: body text ≥4.5:1, large text ≥3:1, verified in both themes (don't rely on a muted gray on a tinted near-white).
- **Light and dark mode**, both first-class — the app is used in bright outdoor light and in dark rooms (a child's bedside at night). Dark mode is a real design target, not an afterthought.
- **Large, comfortable tap targets** (≥44px) with adequate spacing — designed for one-handed, low-precision interaction.
- **Reduced motion** honored throughout (`prefers-reduced-motion`): motion is supportive, never required to understand state.
- **State never conveyed by color alone** (pending/comprado, activa/finalizada also carry an icon, label, or shape) for color-vision differences.
