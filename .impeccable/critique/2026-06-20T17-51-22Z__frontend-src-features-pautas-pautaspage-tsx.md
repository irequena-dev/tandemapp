---
target: pautas
total_score: 34
p0_count: 0
p1_count: 1
timestamp: 2026-06-20T17-51-22Z
slug: frontend-src-features-pautas-pautaspage-tsx
---
# Critique — Pautas surface (re-run, post-fix measurement)

Target: `frontend/src/features/pautas/PautasPage.tsx` (Pautas feature)
Baseline: 22/40 (`2026-06-20T16-08-51Z`). Three fix phases landed on `PautaCard`.
Assessment independence: degraded (sequential — no sub-agent permission granted this session; read-only measurement task). Both assessments still completed independently before synthesis.

## Design Health Score

| # | Heuristic | Score | Baseline | Key Issue |
|---|-----------|-------|----------|-----------|
| 1 | Visibility of System Status | 3 | 2 | Toma success + delete now toast; "Toma reciente" disables + re-labels inline; segment progress shows "Día N de M". Only gap: no optimistic-pending state on the button itself between tap and toast. |
| 2 | Match System / Real World | 3 | 3 | Unchanged — plain adult Spanish, faithful ubiquitous language. Held. |
| 3 | User Control and Freedom | 4 | 3 | Undo is now a deliberate two-step inline confirm (`¿Borrar la toma…?` / Cancelar / Borrar), cleared on card close. Recovered from the silent-destructive-delete regression. |
| 4 | Consistency and Standards | 4 | 2 | `.btn--ghost`/`.btn--xs` are gone — row actions now use the real `.btn` + `.btn--secondary btn--sm` / `.btn--danger-solid btn--sm` vocabulary shared with Hijos. Skeleton mirrors `.hijo-skel-row`; inline-confirm reuses `.hijo-confirm`; error block mirrors `.hijos__error`. Cohesive. |
| 5 | Error Prevention | 3 | 2 | Destructive delete is gated by confirm; duplicate-guard now disables the button AND rewrites its label/aria-label to "Toma reciente" instead of an invisible hover title. Prevention is visible on mobile. |
| 6 | Recognition Rather Than Recall | 4 | 1 | Biggest single move. The collapsed card IS the answer: the due figure (Próxima/Dada/Finalizada, each with icon) is promoted into the header, beside a compact "Marcar toma". Nothing important is behind the disclosure. |
| 7 | Flexibility and Efficiency | 3 | 2 | The primary write action is now a one-tap from the collapsed row (no open → scroll → search). No keyboard accelerator beyond Enter/Space to toggle; that's the remaining gap, not a regression. |
| 8 | Aesthetic and Minimalist Design | 4 | 3 | `opacity:0.6` removed; finalization expressed as tonal step + grouped "Finalizadas" section; "Finalizar Pauta" demoted to a quiet text action; segment progress is calm and non-animated. Clean. |
| 9 | Error Recovery | 3 | 1 | Per-mutation inline errors (`role="alert"`) with humanized messages (401→session, 404→changed-by-another, 409→duplicate, 5xx→retry). Rollback is handled in api.ts; UI only explains. No more silent swallows. |
| 10 | Help and Documentation | 3 | 2 | Empty state now seeds an action ("Ver los Hijos"); duplicate-guard reassurance ("próxima disponible en 15 min") surfaces inline at the moment it matters, not after triggering it. |
| **Total** | | **34/40** | **22** | **Good — address weak areas, solid foundation (+12)** |

## Anti-Patterns Verdict

**LLM assessment:** Still does not read as AI-generated — it reads as finished, careful human work. The taste that was already right (warm sage restraint, Fraunces+Hanken, flat-at-rest, per-caregiver attribution) is now matched by follow-through: the most-glanced number is the most visible, the most-pressed button is the most reachable, and the most dangerous action has a two-step gate. No banned patterns present (no side-stripes, no gradient text, no ghost-card, no eyebrow scaffolding). The new segmented progress and the "Finalizadas" grouping are domain-honest choices, not decoration.

**Deterministic scan:** Clean — `detect.mjs` returns `[]` (exit 0). The previous true positive (`layout-transition` / `transition: width` on `.pauta-progress__fill`) is gone: the continuous bar was replaced by the static segmented indicator, so the layout-animation violation was removed by design, not by suppressing the rule.

**Browser visualization:** blocked — same constraint as baseline. `/pautas` is behind a Clerk `signed-in` gate and no browser-automation tool is available to authenticate or inject. All findings below are source-derived and contrast-verified numerically; none were confirmed by seeing the rendered page. Flagged as a verification limit, not a pass.

## Overall Impression

The fix pass landed exactly where the baseline said it should: the collapsed card became the answer, the write action came to the thumb, the destructive action got a gate, and the silent-failure paths got a voice. The surface now reads the way the PRODUCT.md says it should — "answer at a glance, confirm in a few seconds." The single remaining opportunity is that the surface has no keyboard accelerator and the "Marcar toma" button has no transient pending state, so a slow network turns a one-tap confirm into a tap-and-wait with no in-button feedback.

## What's Working

1. **The collapsed card is now the answer (P0a resolved).** `dueLabel` computes próxima/dada/finalizada and renders it in the header with an icon (`ClockSmall` / `CheckSmall`), so State-Is-Never-Color-Alone holds at the most-glanced spot. Dose, interval and duration all carry `ds-nums`. This is the Recognition-over-recall fix done correctly.
2. **The write action reached the thumb (P0b resolved).** A single `btn--primary btn--sm` lives in a strip at the bottom of the collapsed active card, `stopPropagation`-isolated so a tap registers the dose without also opening the card. When a recent toma exists, the same button disables, relabels to "Toma reciente", and exposes the reason via `aria-label` — the duplicate-guard is now visible on mobile instead of buried in a hover `title`.
3. **Destructive undo is honest (P1 resolved).** `confirmingAdminId` drives a per-row inline confirm reusing `.hijo-confirm` (no modal, no new dep), cleared on card close and on success. The delete path toasts the removed time, and all three mutations surface humanized errors through `.pauta-inline-error[role=alert]`.

## Priority Issues

### [P1] No in-button pending state on "Marcar toma" under slow networks
- **What:** `handleCreateToma` flips `createAdmin.isPending` into the button's `disabled`, but the label stays "Marcar toma" — there's no "Guardando…" the way "Finalizar Pauta" shows "Finalizando…". The success confirmation is a toast, which can land after a perceptible delay on 3G.
- **Why it matters:** The product's emotional promise is "it's handled." On a slow connection a parent taps, sees nothing change, and taps again — the very double-fire the 15-min guard exists to absorb, but the user still feels doubt. Peak-end is served by the toast; the *valley* between tap and toast is unserved.
- **Fix:** Mirror the finish button's pattern: when `createAdmin.isPending`, set the label to "Guardando…" (and keep the disable). One conditional, same vocabulary already in the file.
- **Suggested command:** $impeccable harden

### [P2] Finalizadas section interaction is unsignaled and the sort cue is absent
- **What:** The two `<ul className="pautas__list">` groups (active vs finished) render correctly, but nothing tells the user the list is already prioritized (active-first, then by próxima toma ascending). The "Finalizadas" `<h2>` is a quiet label with no affordance to collapse finished pautas, so a family with many past treatments scrolls past a wall of history to reach nothing below it.
- **Why it matters:** Calm-by-default is right, but "this list is already sorted by what you need now" is reassurance that lowers scanning effort. A long Finalizadas tail is the one place this surface could grow noisy over time.
- **Fix:** Either a tiny muted hint above the active list ("Ordenadas por próxima toma") or make the Finalizadas `<section>` itself a collapsible `<details>` defaulting open with a count in its summary — reuses the disclosure pattern already proven on the cards.
- **Suggested command:** $impeccable distill

### [P2] Segmented progress can misrepresent a same-day-finished course
- **What:** Segments are `day < day_number` → done, `=== day_number` → current, else upcoming. This is honest for a multi-day course, but a pauta whose `duration_days === 1` renders a single "current" segment forever and a finished pauta still shows `day_number` as "current" (the segments don't key off `status === 'finished'`).
- **Why it matters:** A finished treatment showing a half-filled "Día 3 de 7" contradicts the "Finalizada" pill six inches above it. Minor, but it's exactly the kind of stale-state the baseline flagged on the old bar.
- **Fix:** When `pauta.status === 'finished'`, fill all segments as `--done` (or render the label as "Completada"). One branch in the segment className.
- **Suggested command:** $impeccable harden

### [P3] "Última toma" duplicates "Tomas de hoy" for the common case
- **What:** When today has administrations, the last item of "Tomas de hoy" and the entire "Última toma" block show the same row (same time, same member). The body now reads as history, which is the intent, but the last-toma block is redundant whenever `todaysAdmins` is non-empty.
- **Why it matters:** Low. It's a small redundancy inside an expanded body that is itself already demoted to history. But it's the one place the surface repeats itself.
- **Fix:** Only render "Última toma" when `todaysAdmins.length === 0` (i.e., the last dose was on a prior day), so the block carries information instead of repeating it.
- **Suggested command:** $impeccable distill

## Persona Red Flags

**Casey — distracted, one-handed mobile:** Largely fixed. The collapsed card now shows "Próxima · 14:00" and a thumb-reachable "Marcar toma" without opening anything. The one remaining valley: tapping "Marcar toma" on a slow connection shows no in-button pending state, so she's left wondering whether the tap registered until the toast lands. *(Improving: header dueLabel line 162-172, action strip line 216-237. Remaining: pending label line 229.)*

**Sam — accessibility / assistive tech:** Materially improved. `:focus-visible` ring is now on the disclosure header (pautas.css:61), `opacity:0.6` is gone so muted text clears AA on finalized cards (verified 4.72:1 light / 6.07:1 dark), and the status pill carries an icon at the most-visible spot. One residual: the segment progress uses `role="img"` with an aria-label — correct — but the per-segment `<span>`s are decorative without `aria-hidden`, which is a nitpick most screen readers handle fine. *(Improving: pautas.css:61, index tokens, header pills line 201-207.)*

**Marisol — the grandmother / less tech-confident Miembro:** Improved. The due pill tells her at a glance whether the dose is still pending or was already given; the inline confirm ("¿Borrar la toma de las 14:32?") protects her from a stray tap deleting a clinical record; and the duplicate-guard now explains itself ("Toma reciente… espera 15 min") in plain words rather than a silent disabled button. She still cannot see *who* gave the last dose from the collapsed card — attribution remains inside the expanded body. *(Improving: dueLabel, confirm block line 301-327. Remaining: last-administrator-by not in header.)*

## Minor Observations

- **Tabular numbers rule fully honored** — `ds-nums` is on dose, interval, duration, all due/toma times, the progress label, and the confirm copy (11 occurrences). The most-glanced figures now align.
- **Skeleton is correct** — `.pauta-skel` mirrors `.hijo-skel-row`, two rows pulse with the shared `skel-pulse`, `aria-busy` on the container, `aria-hidden` on the decorative list. Better than "Cargando…".
- **"Finalizar Pauta" is now visually quiet** — a transparent text action that recedes to muted and only goes danger-red on hover/focus. No longer a peer to "Marcar toma". Correct demotion.
- **`pauta-rise` entrance animation** is gated by `prefers-reduced-motion` via the global rule in index.css, and it animates transform/opacity only — no layout property. Compliant.
- **The clay "Próxima" pill clears AA** in both themes (5.63:1 light, 6.81:1 dark) — the `--ds-attn-ink`/`--ds-attn-bg` pair was already tuned for this; the promotion into the header didn't break contrast.
- **`toggleOpen` clears `confirmingAdminId` on close** via a functional setState update — no stray "¿Segura?" row when reopening. Good state hygiene, no effect cascade.

## Questions to Consider

1. The collapsed card now answers "when is the next dose" — should it also answer "who gave the last one" for the multi-caregiver trust case, or does adding a name to the header tip it past glanceable into busy?
2. With the Finalizadas section growing unbounded over a child's life, is a collapsible history the honest long-term shape, or should finished pautas graduate off this screen entirely (to the health-visit record they came from)?
3. The in-button pending state is the one place this surface still asks the user to trust a tap without immediate feedback — is "Guardando…" enough, or does the product's "never fake certainty" principle argue for waiting on the toast only?

## Verification limits

This critique is source-only. `/pautas` is behind a Clerk `signed-in` gate and no browser-automation tool was available, so the rendered page was not seen. What was verified by reading: presence of every fix listed in the brief, removal of every baseline defect, `ds-nums` coverage, focus-visible, inline-confirm reuse, skeleton/empty/error patterns, and the grouping logic. What was verified numerically: WCAG contrast for the status pills and muted text in both themes (all pass AA). What was NOT verified: actual rendered layout at 360px width, real toast timing, real keyboard tab order, and how the Finalizadas section feels with many entries. The 151/151 test suite is reported passing but was not re-run here.
