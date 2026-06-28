---
target: pautas
total_score: 22
p0_count: 2
p1_count: 3
timestamp: 2026-06-20T16-08-51Z
slug: frontend-src-features-pautas-pautaspage-tsx
---
# Critique — Pautas surface

Target: `frontend/src/features/pautas/PautasPage.tsx` (Pautas feature)
Assessment independence: full (two isolated sub-agents — design review + detector/browser).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | "Marcar toma" success gives no toast/confirmation; duplicate-guard surfaces only as a disabled button + hover `title` (invisible on mobile). |
| 2 | Match System / Real World | 3 | Plain, adult Spanish throughout; "Pauta" is the right clinical-into-domestic word. |
| 3 | User Control and Freedom | 3 | Undo exists per-toma, but fires as a silent destructive delete — no confirm, no toast. |
| 4 | Consistency and Standards | 2 | `.btn--ghost` / `.btn--xs` referenced (line 141) but defined nowhere — undo button renders as an orphaned 48px transparent block. |
| 5 | Error Prevention | 2 | Duplicate-guard is thoughtful but unreachable on mobile; no guard before destructive undo. |
| 6 | Recognition Rather Than Recall | 1 | The whole list collapses by default — the next-due time is hidden behind a tap on every card. |
| 7 | Flexibility and Efficiency | 2 | No quick-confirm from the collapsed row; consult-and-confirm slowed to open → scan → find button. |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, flat-at-rest honored, Fraunces+Hanken correctly paired, sage scarce — marred only by opacity-0.6 finalize and the broken ghost button. |
| 9 | Error Recovery | 1 | No error UI at all (sibling Hijos surface has `.hijos__error`); failed mutations are silently swallowed. |
| 10 | Help and Documentation | 2 | Empty state copy is warm and explains the voice path; the 15-min rule is only explained after triggering it. |
| **Total** | | **22/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment:** Does not read as AI-generated — it reads as competent human work with real domain care (the 15-minute duplicate-guard, member attribution, tabular times) that shipped before finishing. Two button classes referenced and never defined, the primary action locked behind disclosure, and the most-glanced numbers (dose, interval) silently skipping the tabular-nums rule. The taste is right; the follow-through has gaps.

**Deterministic scan:** One true positive — `layout-transition` at `pautas.css:151` (`transition: width` on `.pauta-progress__fill`, animating a layout property). No false positives; the match is accurately located.

**Browser visualization:** blocked. `/pautas` is behind a Clerk `signed-in` gate (App.tsx) and no browser-automation tool was available to authenticate or inject. No user-visible overlay this run; source-based evidence covers both assessments.

## Overall Impression

The visual register is exactly right for tired parents — calm, flat, warm-neutral, sage spent sparingly. But the surface optimizes the wrong path: it hides the headline figure (next dose due) and buries the primary action (record a dose) behind expand-to-open, which is the inverse of the product's stated consult-and-confirm job. The single biggest opportunity: **make the collapsed card itself the answer** ("Próxima toma · 14:00 · Marta"), and demote the expanded body to pure history.

## What's Working

1. **Honest domain modeling.** The 15-minute duplicate-guard window prevents a silent backend no-op, and per-toma member attribution ("Dada por Marta") directly serves the multi-caregiver handoff that is the product's reason to exist.
2. **Correct visual restraint.** Flat-at-rest honored (no resting shadows), Fraunces display paired with Hanken body per DESIGN.md, sage scarce (button + activa pill + progress fill only). The right aesthetic, not cutesy, not corporate.
3. **Accessibility primitives where it counts.** `aria-expanded`, `role="button"`, keyboard Enter/Space handler, `aria-labelledby`, decorative-icon `aria-hidden`, and the global `prefers-reduced-motion` guard are all present — the disclosure is genuinely keyboard-operable (it just lacks a visible focus ring).

## Priority Issues

### [P0] The collapsed card hides the primary read path
- **What:** `PautaCard` defaults `open=false`; `next_dose_at`, the last admin, and progress render only inside `{open && ...}`. The header shows medication, dose, child, interval, duration — but not the next-due or last-given time.
- **Why it matters:** The core job is consult-and-confirm ("when is the next Administración due and who gave it"). That exact figure is gated behind a tap on every card — violating Recognition over recall and the single-focus rule.
- **Fix:** Promote the next-due figure to the collapsed header — "Próxima · 14:00" or "Dada hace 38 min · próxima 14:00" — using the existing `--proxima`/`--dada` pill vocabulary (which carry icons, satisfying State-Is-Never-Color-Alone). Collapse detail (full tomas list, fin del tratamiento), not the headline.
- **Suggested command:** $impeccable layout

### [P0] The primary write action is buried inside disclosure
- **What:** "Marcar toma" sits at the bottom of the expanded body, behind the open tap, below the progress bar and the full tomas list, beside an equally-weighted "Finalizar Pauta".
- **Why it matters:** "I just gave the dose" is the most frequent, most time-pressured write action — performed one-handed. Two taps + a scroll + visual search is the wrong cost curve; also fails "primary actions live in thumb range".
- **Fix:** Surface a compact "Marcar toma" affordance on the collapsed card for the active pauta whose dose is due/overdue. Move "Finalizar Pauta" to a quieter overflow location — it is infrequent and should not compete with the dose action.
- **Suggested command:** $impeccable layout

### [P1] `.btn--ghost` / `.btn--xs` undefined — the undo button renders broken
- **What:** Line 141 uses `btn btn--ghost btn--xs`; grep across `frontend/src` confirms both modifiers are defined nowhere. The button inherits bare `.btn`: min-height 48px, weight 600, transparent background, large horizontal padding.
- **Why it matters:** Inconsistency, wrong visual weight for a destructive tertiary action, and oversized in a ~28px row — inviting accidental taps.
- **Fix:** Replace with the existing `.icon-btn` pattern (children.css) using a small undo glyph + `aria-label`, matching how row actions are handled on the Hijos surface; or define `.btn--ghost`/`.btn--xs` alongside `.btn--sm`.
- **Suggested command:** $impeccable polish

### [P1] Destructive undo fires with no confirm and no feedback
- **What:** `deleteAdmin.mutate(...)` is immediate — no confirm dialog, no toast, no undo-of-undo.
- **Why it matters:** A recorded dose is a clinical data point; silently deleting it on a stray thumb tap is the highest-stakes accident on the surface, and there is no error path if the mutation fails.
- **Fix:** Adopt the inline-confirm pattern proven on Hijos (`.hijo-confirm`) or at minimum a confirm step; add a success toast ("Toma de las 14:32 eliminada").
- **Suggested command:** $impeccable harden

### [P1] No focus-visible ring on the disclosure trigger (a11y)
- **What:** `.pauta-card__header` has `:hover` but no `:focus-visible` anywhere in pautas.css; the `div[role="button"]` gets no visible focus indicator.
- **Why it matters:** The disclosure is the only way to reach detail — keyboard/switch users can't see their location. WCAG 2.4.7 and the system's own focus-ring token go unused.
- **Fix:** `.pauta-card__header:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: 2px; }`, matching `.btn:focus-visible`.
- **Suggested command:** $impeccable polish

## Persona Red Flags

**Casey — distracted, one-handed mobile (most affected):** Collapsed card gives nothing actionable — to record a dose she opens the card, scrolls past progress + tomas, then finds "Marcar toma" beside "Finalizar Pauta". The duplicate-guard hint is a hover `title` she never sees. The broken ghost undo is a 48px transparent block near her thumb. *(Failing: collapsed header line 97-104; primary button line 204; undo line 141.)*

**Sam — accessibility / assistive tech:** No `:focus-visible` on the disclosure trigger. `opacity: 0.6` on finalized cards drops muted text below AA 4.5:1. The activa/finalizada status pill in the header is color-only — it carries no icon there (icons appear only inside the expanded body), breaching State-Is-Never-Color-Alone at its most visible spot. *(Failing: pautas.css lines 43, 39, 80.)*

**Marisol — the grandmother / less tech-confident Miembro:** Member attribution is the trust feature for her, but it appears only inside the expanded card. On the collapsed card she can't see at a glance whether the dose was given by her daughter or still pending. "Deshacer" as a visible word on every row, with no confirm/toast, is a dangerous affordance. *(Failing: header omits last-administered-by; undo line 139-146.)*

## Minor Observations

- **Tabular Numbers Rule broken on the most-glanced figures.** Dose (line 99) and interval/duration (line 102) render without `ds-nums`; day_number and times do. Add `ds-nums` to `.pauta-card__med` and the numeric spans in `.pauta-card__sub`.
- **`opacity: 0.6` on finalized cards** dims the whole card including text — pushes muted text below AA. Remove it; express finalization via the pill (add a check glyph) + a tonal step, and group finished pautas into a separate "Finalizadas" section.
- **Progress bar is computed once at render** (`new Date()` at line 71) and never updates while open — stale fill; also advances during uneventful hours. Prefer a discrete "Día 3 de 7" segmented indicator (calm, honest, non-animated) over the continuous bar.
- **Sort is good but unsignaled** — active-first, then by next-dose ascending — no visible cue that the list is already prioritized.
- **No skeleton loader** ("Cargando…" text only) — sibling Hijos surface has a `.skel` system worth matching.
- **Empty state offers no create affordance** — copy says "aparecerá aquí" with no button; Hijos seeds an action from empty.
- **"Finalizar Pauta" (`btn--secondary`) reads as a peer to "Marcar toma"** — an infrequent finishing action should be visually quieter.

## Questions to Consider

1. If a parent can do one thing on this screen, should it be "open a card" or "confirm the next dose"? What if the collapsed card *were* the answer, and the expanded body were pure history?
2. Is "progress through the treatment course" a question any parent asks — or does the continuous bar import a SaaS-KPI mental model the brand rejects? Would "Día 3 de 7" be more honest?
3. The 15-minute duplicate-guard is the most thoughtful engineering here — so why is it the least visible? Could it *be* the reassurance moment: "Dada a las 14:32 por Marta — próxima disponible 14:47"?
