---
target: eventos
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-06-20T17-13-56Z
slug: frontend-src-features-eventos-eventospage-tsx
---
# Critique — Eventos (frontend/src/features/eventos/EventosPage.tsx)

Target: `eventos` → `frontend/src/features/eventos/EventosPage.tsx` (+ SeriesForm, EventTypesManager, eventos.css)

Re-run after the six-step impeccable pass (layout → harden → adapt → clarify → typeset → polish). Previous run: 22/40, 3 P1.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeleton for `useEvents`, per-row pending (disabled action while mutation in flight), success/error toasts on every mutation (create/update/done/delete/series), load-error block with Reintentar, EventTypesManager skeleton instead of `null` flash |
| 2 | Match System / Real World | 4 | Relative dates (Hoy/Mañana/Pasado mañana/Ayer/Anteayer) alongside absolute; temporal sections (Atrasados/Hoy/Próximos) match how a Miembro actually thinks about the agenda |
| 3 | User Control and Freedom | 4 | Single delete → optimistic + 6s "Deshacer" toast that re-creates the Evento; bulk "Borrar futuras" → inline confirm with Cancelar; Hechos collapsible with per-item undo |
| 4 | Consistency and Standards | 4 | Filter pills 44px, form + manager inputs 44px — now match `.icon-btn` and the DESIGN.md floor; confirm pattern mirrors Pautas; FAB uses `--ds-shadow-floating` + `--ds-z-sticky` |
| 5 | Error Prevention | 3 | Bulk destroy is no longer one-tap (inline gate); single delete has an undo escape; filters expose AND-logic via labelled groups. Minor edge cases remain (no field-level validation) |
| 6 | Recognition Rather Than Recall | 4 | Toggles keep stable labels and carry `aria-pressed` + sage active tint (open is conveyed visually, not lexically); temporal section headings orient instantly; filters labelled by dimension |
| 7 | Flexibility and Efficiency | 3 | Quick-mark done from the list, FAB create in the thumb zone, clearable filters, undo. No keyboard shortcuts or bulk-complete yet |
| 8 | Aesthetic and Minimalist Design | 4 | Header decongested (2 toggles + FAB instead of 3 competing top buttons); meta broken into scannable chips; done events recede into a collapsed section |
| 9 | Error Recovery | 3 | Load failure names the problem and offers Reintentar; mutation failures toast in plain language with optimistic rollback already in the api layer; delete is undoable. Recovery is not yet field-pinpoint |
| 10 | Help and Documentation | 3 | Empty state still teaches the voice-dictation path; aria-labels present; section headings guide. No inline help, but the surface is simple enough not to need it |
| **Total** | | **36/40** | **Excellent — the read path and interaction safety now carry their weight** |

## Anti-Patterns Verdict

**Does this look AI-generated? No.** Still the opposite of slop: the committed DESIGN-V2 vocabulary is intact and now more consistently applied. The 44px floor is honored everywhere a thumb lands; sage stays scarce (≤10%), reserved for active filter/toggle, the FAB, and "handled"; destructive intent (Borrar futuras, the delete icon-btn, the overdue heading) consistently borrows the danger vocabulary rather than the brand hue; cards flat at rest, depth only on the FAB/toast/confirm; no gradient text, no side-stripes, no ghost-card pairing, no over-rounding. Display serif still confined to the screen title.

**Deterministic scan:** `detect.mjs --json frontend/src/features/eventos` → exit 0, **0 findings**. No structural bans; nothing the machine caught that the review missed.

**Visual overlays:** not available this session — no browser-automation surface exposed. Fallback: static source + computed review against the committed tokens (muted 5.58:1, primary 4.88:1 white-text, danger-pill ink pairs with icon).

## Overall Impression

The surface now does its job. A tired Miembro opens Eventos and the first thing back is **Atrasados → Hoy → Próximos** — the things that need them now — with completed work moved out of the primary view and an undo on every delete. The flat ascending-by-date dump that used to bury upcoming events below the fold is gone. Combined with relative dates, a thumb-zone FAB, and a confirm gate on the only bulk-destroy path, the surface behaves as calm as it always looked.

## What's Working

1. **The read path finally answers "what needs me now."** Temporal grouping with section headings plus the collapsed Hechos section means a 3-second, one-handed glance returns overdue and today's events first — the surface's core consult job is now met, not inverted.
2. **Every destructive path has an escape.** Single delete is optimistic + a 6s undo toast that re-creates the Evento; series-future delete is gated behind an inline confirm (mirroring Pautas' per-row confirm). A thumb slip is no longer irreversible.
3. **State is visible everywhere it wasn't.** Skeleton for `useEvents`, a skeleton for the previously-`null`-flashing EventTypesManager, per-row disabled-while-pending actions, and success/error toasts on every mutation close the old "nothing happened" gap.

## Priority Issues

**[P2] Undo is a timed affordance, not a persistent one.** The single-delete "Deshacer" lives in a 6s toast. If the Miembro is interrupted mid-glance (the core use case), the window closes and the event is gone for good.
*Fix:* Either persist the deleted item in a short-lived "reciente borrado" surface, or widen/loop the toast affordance for destructive undos.
*Suggested command:* `$impeccable harden`

**[P2] No keyboard accelerators for the frequent writes.** Quick-mark-done, create, and edit are all pointer-only; a Miembro who keeps the app open on a desk has no faster path.
*Fix:* Add a small shortcut layer (e.g. "n" for new, "j/k" to move, "x" to toggle done) behind a `?` hint.
*Suggested command:* `$impeccable adapt`

**[P3] Per-row pending is a disabled state, not a visible affordance.** While a done/delete mutation is in flight the button greys out, but there is no spinner or inline "guardando…" — for a slow connection the feedback is subtle.
*Fix:* Add a tiny spinner / inline label on the in-flight row, reusing the skeleton motion vocabulary.
*Suggested command:* `$impeccable polish`

## Persona Red Flags

**Casey (Distracted Mobile User):** Largely cleared. The create affordance is now a thumb-zone FAB, filters and toggles are 44px, and temporal sections orient a returning Casey in one glance. Remaining: the timed undo can be missed if interrupted, and there's no offline indicator beyond the load-error block.

**Riley (Stress Tester):** Mostly cleared. Bulk-delete is gated and confirmed; mutations surface failure via toast and roll back optimistically; empty/loading/error are all handled. Remaining: spamming the undo right as the 6s toast expires is a race that silently loses the restore.

**Sam (Accessibility-Dependent):** Improved. Toggles now carry `aria-pressed`, filters are in labelled `role="group"`s with `aria-pressed`, the FAB carries `aria-expanded`/`aria-haspopup`, and pills gained `:focus-visible` rings. Remaining: the "Hechos" disclosure is a custom button (no native `<details>`), so the expanded/collapsed state relies on `aria-expanded` alone — fine, but worth a screen-reader pass to confirm the section is announced.

## Minor Observations

- The FAB sits at `z-sticky` (1100), below the toast viewport (1400) — correct, but confirm the FAB never overlaps the last list row's actions on short screens (bottom padding was bumped to compensate).
- "Borrar futuras" confirm is inline and per-row; if a series has many visible occurrences the confirm affordance repeats on each — acceptable, but a single series-management surface would centralize it.
- Relative-date chips help, but far-future events (months out) still render only the absolute date — a "en 3 semanas" tertiary could help, though it risks clutter.
- `evento-chip__rel` uses sage for the relative word; on the Atrasados section the overdue context is already danger-tinted, so the sage date word is the only non-danger color there — intentional contrast, worth a visual check.

## Questions to Consider

- Should destructive undo be persistent (a "recién borrado" section) rather than timed, given interruption is the core context?
- Is the inline per-row "Borrar futuras" confirm the right home, or does series management deserve its own surface now that the list groups temporally?
- Would a single "Hoy" focused default view (with Atrasados/Próximos one tap away) reduce load further than showing all three sections at once?
