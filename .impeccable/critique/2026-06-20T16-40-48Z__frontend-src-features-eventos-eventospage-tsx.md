---
target: eventos
total_score: 22
p0_count: 0
p1_count: 3
timestamp: 2026-06-20T16-40-48Z
slug: frontend-src-features-eventos-eventospage-tsx
---
# Critique — Eventos (frontend/src/features/eventos/EventosPage.tsx)

Target: `eventos` → `frontend/src/features/eventos/EventosPage.tsx` (+ SeriesForm, EventTypesManager, eventos.css)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No skeleton while `useEvents` loads; mutations (create/done/delete) show no pending or error feedback; no confirmation toast |
| 2 | Match System / Real World | 3 | Faithful ubiquitous language; absolute dates where relative ("mañana", "hoy") would reduce load |
| 3 | User Control and Freedom | 1 | Single-tap delete with no confirm and no undo; "Borrar futuras" is a one-tap bulk destroy with no escape |
| 4 | Consistency and Standards | 3 | Strong token adherence; filter pills at 36px and form inputs at 40px break the project's own 44px tap-target standard |
| 5 | Error Prevention | 1 | Destructive actions (delete event, delete-series-future) fire instantly with no guardrail; type+child filter AND-logic is unexplained |
| 6 | Recognition Rather Than Recall | 2 | Three toggle buttons mutate their own labels ("Crear Evento"→"Cancelar"); one flat pill row conflates two filter taxonomies |
| 7 | Flexibility and Efficiency | 2 | Filters present, but no keyboard shortcuts, no bulk-complete, no quick-mark from the list |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and on-brand; header carries 3 competing actions and the meta line is a dense inline string |
| 9 | Error Recovery | 2 | No inline error surface; failed refetch/mutation is invisible to the user |
| 10 | Help and Documentation | 3 | Empty state teaches (references voice dictation); aria-labels present; no inline guidance but the surface is simple |
| **Total** | | **22/40** | **Acceptable — significant IA and interaction-safety work before this is genuinely calming** |

## Anti-Patterns Verdict

**Does this look AI-generated? No.** This is the opposite of slop: a restrained, token-disciplined surface that visibly follows the committed DESIGN-V2 system. Sage stays under ~10% of the surface, state pills carry icon **and** word (not color alone), cards are flat at rest, no gradient text, no ghost-card border+shadow pairing, no side-stripes, no over-rounding (cards at `--ds-r-lg`/20px, controls at 12px), display serif correctly confined to the screen title. A fluent product designer would trust the visual vocabulary screen-to-screen.

**LLM assessment of tells:** none of the cross-register bans land. The weaknesses are not aesthetic — they are information-architecture and interaction-safety. The surface *looks* calm but does not yet *behave* calm.

**Deterministic scan:** `detect.mjs --json frontend/src/features/eventos` → exit 0, **0 findings**. The detector confirms the absence of the structural bans (no gradient text, no sketch SVG, no stripe backgrounds, no ghost-card pairing). No false positives to flag; nothing the machine caught that the review missed.

**Visual overlays:** not available this run — no browser-automation surface is exposed in this session, so the live overlay/injection path was skipped (fallback: static source + computed contrast review against the committed tokens, which already document muted 5.58:1 on surface and primary 4.88:1 white-text).

## Overall Impression

The visual craft is genuinely good and firmly on-system — this is a surface that already feels like Tándem. What it gets wrong is the *job*: a tired Miembro opens Eventos to answer "what needs me now," and instead gets a flat, ascending-by-date dump where **past, done, overdue, and upcoming events are interleaved**, with past items dominating the top of the list and pushing what actually matters below the fold. The single biggest opportunity is to make the read path earn its keep — group by temporal urgency (Overdue → Hoy → Próximos), hide completed by default, and surface relative dates — and to put a guardrail in front of every delete.

## What's Working

1. **State is never color alone.** `statusVisual` pairs an icon (check / clock / alert) with a word (Hecho / Pendiente / Atrasado) on every pill, exactly per The State-Is-Never-Color-Alone Rule. The overdue pill correctly tints danger at 12% with danger-ink text.
2. **The empty state teaches and on-brands.** "Crea un evento o díctalo por voz" connects this surface to the hands-free input path described in PRODUCT.md — it tells the Miembro the *other* way in rather than just saying "nothing here."
3. **Series preview is a confidence-builder.** `SeriesForm` materializes the actual occurrences (capped at 12, "+N más") before commit — a real error-prevention move that turns an abstract recurrence rule into something a Miembro can verify at a glance.

## Priority Issues

**[P1] The list is sorted ascending by date, so the past dominates the top.** Overdue/done events have the earliest dates and rise to the top, pushing upcoming events — the things a Miembro actually needs — below the fold. This inverts the product's own "answer at a glance / surface what matters now" principle.
*Why it matters:* a one-handed, 3-second glance returns the least useful events first; the surface fails its core consult job.
*Fix:* Group temporally (Atrasados → Hoy → Próximos) with sub-headings; collapse or move done events out of the primary view; default-sort upcoming ascending. Render overdue as its own elevated section, not just a pill.
*Suggested command:* `$impeccable layout`

**[P1] Destructive actions fire on a single tap with no confirm and no undo.** `deleteMut.mutate(ev.id)` and, worse, `deleteSeriesFutureMut.mutate(ev.series_id!)` ("Borrar futuras" — a bulk destroy of an entire series' future) execute immediately. There is no confirmation dialog and no undo affordance.
*Why it matters:* a thumb slip deletes a whole series of future appointments irreversibly; this is the highest-stakes data-loss path on the surface.
*Fix:* Gate series-future-delete behind a confirm; for single deletes, implement optimistic delete + an undo toast (the design system already defines a Toast shadow). Never make a bulk destroy a one-tap action.
*Suggested command:* `$impeccable harden`

**[P1] Tap targets sit below the project's own 44px floor.** Filter pills are `min-height: 36px` (eventos.css:45) and `evento-form`/`et-manager` inputs are `min-height: 40px` (eventos.css:328, eventos.css:273). DESIGN.md commits to ≥44px for one-handed, low-precision use. The `icon-btn` correctly hits 44px (children.css:127), making the shortfall inconsistent within the same screen.
*Why it matters:* tired, one-handed, low-precision taps on 36–40px targets produce mis-taps; the surface undercuts its primary ergonomic principle.
*Fix:* Bring pills to 40–44px and inputs to 44px to match the icon buttons and the committed standard.
*Suggested command:* `$impeccable adapt`

**[P2] Three header toggles mutate their own labels, with no visual active state.** "Crear Evento"↔"Cancelar", "Gestionar tipos"↔"Cerrar tipos", "Crear Serie"↔"Cerrar Serie". The only signal a panel is open is the button's *text* changing — recognition is replaced by recall, and the three actions compete for the same region with no affordance showing which (if any) is open.
*Why it matters:* a returning Miembro can't see at a glance what state the screen is in; the toggles read as six different buttons rather than three.
*Fix:* Give toggles a persistent active treatment (the existing `.eventos__filter--active` sage tint works), keep a stable primary label, and convey "open" visually rather than lexically. Consider promoting "Crear Evento" to a single primary FAB (the design system defines one) and moving Tipos/Serie into a secondary menu.
*Suggested command:* `$impeccable clarify`

**[P2] One flat filter row conflates two taxonomies with implicit AND-logic.** Type pills and child pills sit in a single row as equals; selecting one of each silently ANDs them, and "Todos" resets both. With 4 types + 2 kids that is 7 options at one decision point (over the ≤4 working-memory guideline).
*Why it matters:* the Miembro can't tell which dimension is active or that two filters combine; filtering becomes guessing.
*Fix:* Separate "por tipo" and "por Hijo" into two labeled groups, or make the active filter explicit (chips with remove ×). Reduce simultaneous options below the working-memory ceiling.
*Suggested command:* `$impeccable layout`

## Persona Red Flags

**Casey (Distracted Mobile User):** Primary actions ("Crear Evento", filters) live in the *top* half, outside the thumb zone — the surface has no bottom-anchored primary action or FAB despite the design system mandating one. A 36px filter pill is a mis-tap waiting to happen one-handed. Returning mid-task, Casey finds no temporal grouping to orient on and must re-scan the whole flat list.

**Riley (Stress Tester):** Bulk-deleting a series via "Borrar futuras" is one tap with no confirm — Riley will trigger it by accident and find no undo and no error UI when a mutation fails. Empty/error/loading are not all handled: there is no skeleton while events load and no visible failure state if the refetch rejects.

**Sam (Accessibility-Dependent):** Keyboard reach is decent — icon buttons are 44px with `:focus-visible` rings and aria-labels, and the filter group is a labelled `role="group"`. But the filter pills have **no** `:focus-visible` style (only `:hover`), so a keyboard user gets the browser default and loses the sage ring the rest of the surface uses. Toggle-button state is conveyed by changed text only — no `aria-pressed` — so a screen reader can't tell which panel is open.

## Minor Observations

- `evento-item__meta` is one inline `date · time · type · child` string that wraps unpredictably on narrow screens; structured chips would scan faster and align.
- "Borrar futuras" is rendered as a plain underlined **sage** link (the brand/primary color) for a destructive bulk action — destructive intent should borrow from the danger vocabulary, not the brand hue.
- `formatTime` does `t.slice(0,5)` and dates render absolutely; relative dates ("mañana", "hoy", "pasado mañana") would materially cut scan time on a consult surface.
- Done events have no way to be hidden/archived — completed items pollute the upcoming view over time.
- `EventTypesManager` returns `null` while loading (`isLoading`) — a types-section that vanishes mid-fetch is a flash of missing content; a one-line skeleton would be calmer.
- `eventIcon` falls back to a bare `<circle>` for any unknown icon name — a slightly more recognizable default (a calendar tick) would read less like a placeholder.

## Questions to Consider

- What if the default view answered exactly one question — "what needs me today/next" — and everything else (past, done, far future) receded unless asked for?
- Does "Borrar futuras" belong inline on every series event, or only on a series detail/management surface where the consequence is understood?
- If creates are the single most common write, why isn't the primary affordance a thumb-zone FAB instead of a top-row button?
- Would relative dates and a temporal section heading do more for calm than any visual change could?
