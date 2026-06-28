---
target: compra
total_score: 23
p0_count: 2
p1_count: 2
timestamp: 2026-06-20T17-30-35Z
slug: frontend-src-features-compra-comprapage-tsx
---
# Critique — Compra (shopping list)

**Target:** `frontend/src/features/compra/CompraPage.tsx` (+ `compra.css`)
**Register:** product · **North star:** "The Shared Ledger on the Fridge Door" (calm, trustworthy, effortless)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Mutations are fire-and-forget; no toast/confirmation on toggle, add, or clear. |
| 2 | Match System / Real World | 3 | Plain family Spanish. Three overlapping "remove" semantics (Deshacer / Limpiar / delete) aren't distinguished. |
| 3 | User Control and Freedom | 1 | "Limpiar comprados" + per-row delete are irreversible with **zero** confirmation or undo. Worst on the page. |
| 4 | Consistency and Standards | 3 | Delete-ish actions take three different shapes (text "Deshacer", text "Limpiar", trash icon). |
| 5 | Error Prevention | 2 | Edit-on-blur commits on *any* blur (tab/scroll/notification/nav); empty draft silently drops. |
| 6 | Recognition Rather Than Recall | 3 | Bought collapsed by default hides "who bought what"; hover-revealed actions invisible on touch. |
| 7 | Flexibility and Efficiency | 2 | No keyboard add/toggle, no batch, no quantity, no reorder; fast path is off-page (dictation). |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and uncluttered, but clutter is pushed into discoverability debt (hidden actions). |
| 9 | Error Recovery | 1 | No undo for delete/clear; no error state when the query fails (page silently looks empty). |
| 10 | Help and Documentation | 2 | Empty state cross-sells dictation (good); no inline help for the hidden edit/delete affordances. |
| **Total** | | **23/40** | **Acceptable — significant improvements needed before the surface earns its premise** |

## Anti-Patterns Verdict

**Does this look AI-made? No.** The bans are clean: no side-stripes, no gradient text, no decorative glass, no ghost-card (1px border and soft shadow never stacked), no identical card grid, no uppercase tracked eyebrows, no numbered scaffolding. The continuous list with hairline dividers reads as one shared ledger — exactly the north star, and a deliberate dodge of the card-grid reflex. Fraunces is correctly confined to the title; Hanken carries the working UI. The one generic beat is the empty state (circle-icon + title + subtitle), the most templated pattern in the book, but it's restrained enough to pass.

**Deterministic scan (`detect.mjs` on the source):** clean — 0 findings, exit 0, run on both the TSX and the `compra/` directory. The detector is a static-markup scanner; it cannot see the interaction/contrast failures that actually matter here (hover-gating, missing confirmations, the hardcoded `stroke="#fff"` check glyph that breaks in dark mode). So "clean scan" is a shallow signal, not absolution. No false positives to flag.

**Browser overlays:** not available this session — dev server is live on :5173 but no browser-automation tooling is exposed, so no in-page `[Human]` overlay was injected. Findings below are source-level. Fallback signal: deterministic scan + expert source review.

## Overall Impression

A genuinely well-typed, on-system surface — calm, flat-at-rest, properly tokenized, with real a11y plumbing (descriptive aria-labels that include the item text, `aria-expanded`, focus ring). It feels handcrafted, not generated. But three load-bearing interaction failures sit right where this product is most vulnerable: a tired parent, one-handed, who taps wrong. The page is gentle everywhere except where it can actually hurt you — destructive actions with no confirmation or undo, edits that silently commit or silently vanish, and secondary actions that are invisible on the touch device this PWA is built for. The single biggest opportunity: **make the destructive and edit paths as calm and recoverable as the tick path already is.**

## What's Working

1. **Typographic & token discipline.** Fraunces only on the title, Hanken everywhere else, flat-at-rest with no forbidden shadows, tabular-ready counts. The system is followed, not approximated — rare.
2. **The continuous hairline-divided list** instead of a grid of identical cards. Reads as one shared ledger, sidesteps the card-grid ban, and is the right affordance for a fridge list.
3. **A11y plumbing is real.** `aria-labelledby`, `aria-expanded`, per-action labels with the item text baked in (`Marcar {item.text} como comprado`), explicit focus ring on the input.

## Priority Issues

**[P0] Destructive "Limpiar comprados" — no confirmation, no undo**
- *Why:* irreversibly erases the shared record of who bought what. Highest-risk control on the screen for a one-handed, distracted user; it sits a thumb-width from the collapse chevron. Violates Nielsen 3 and the product's own "honest optimistic feedback" principle.
- *Fix:* two-step confirm ("¿Borrar N comprados? Sí / No") **and** a toast with Undo, reusing the toast system already in the repo. Destructive actions should never be a single silent tap.
- *Command:* **`$impeccable harden`**

**[P0] Edit-on-blur silently commits (and silently drops) edits**
- *Why:* `onBlur={commitEdit}` fires on tab, scroll focus-loss, a notification pull-down, or navigation away — so a parent mid-edit loses their edit or saves a half-typed fragment. Data-loss-by-navigation.
- *Fix:* commit only on Enter; treat blur as cancel (or keep a transient draft with a visible Guardar/Descartar). Empty draft = cancel, not silent drop.
- *Command:* **`$impeccable harden`**

**[P1] Row actions are hover-gated (`opacity:0`) on a touch-first product, and below the 44px floor**
- *Why:* `.compra-item__actions { opacity: 0 }` reveals Edit/Delete only on `:hover`/`:focus-within`. There is no hover on a phone — the primary device. Edit/Delete are invisible until the user happens to focus the row, and the buttons (32px) and check (24px) are under the 44px tap floor. Casey (one-handed mobile) cannot reliably edit, delete, or even tick.
- *Fix:* `@media (hover: none) { .compra-item__actions { opacity: 1 } }` so actions are always visible on touch; enlarge hit areas to 44px via padding (icon stays 16px). Consider long-press/swipe-to-reveal for delete so the resting row is purely tick-able and the tick can grow.
- *Command:* **`$impeccable clarify`** (discoverability) or **`$impeccable layout`** (tap targets)

**[P1] Bought section collapsed by default fights "answer at a glance"**
- *Why:* the page's job is to show what's left *and* honestly reflect who already handled what — that social-proof signal ("papá already got the milk") is the core mental-load relief, and it's hidden one tap deep.
- *Fix:* default open while bought count is small (≤8), collapse only when noisy; or always open with the count pill carrying the summary. Let the pill, not a collapsed section, summarize.
- *Command:* **`$impeccable clarify`**

**[P2] No "needs you now" (clay) anywhere, and dark-mode check glyph breaks**
- *Why:* `--ds-attn` exists for the one genuinely-urgent item and the page ignores it — a consistency gap. Separately, `CheckIcon` hardcodes `stroke="#fff"`; in dark mode `--ds-success` is a light sage (#93b382) and white-on-light-sage fails contrast, so the checkmark all but vanishes.
- *Fix:* an opt-in urgent flag (dictation-settable) rendered as a clay dot+icon, never color alone. Replace the hardcoded white with a token that inverts per theme.
- *Command:* **`$impeccable colorize`**

## Persona Red Flags

**Casey — distracted, one-handed mobile user (primary)**
- `.compra-item__actions { opacity: 0 }` → Edit/Delete invisible; no hover on a phone. Casey literally cannot edit or delete without stumbling onto focus.
- Check (24px) and action buttons (32px) below the 44px floor — miss-taps while holding a child.
- "Limpiar comprados" sits next to the collapse chevron in the same flex row — fat-finger destructive trigger.
- No optimistic toast on tick → Casey glances away unsure the tap registered.

**Jordan — first-timer**
- Three unlabeled "remove" semantics (Deshacer text / Limpiar text / trash icon) — Jordan can't tell which is reversible.
- Edit is undiscoverable (hover-gated) — Jordan never learns items are editable.
- If the query fails, the page looks genuinely empty — Jordan concludes "there's nothing to buy" when really it didn't load.

**Sam — accessibility-dependent**
- Good: descriptive aria-labels, `aria-expanded`, input focus ring.
- Bad: row action buttons, toggles, and the clear button have no `:focus-visible` outline (only the input does) — focus is often invisible against warm tones. `.compra__clear` is destructive with no confirmation and no clarifying aria-label. `.compra-item__meta` (authorship) is borderline-contrast muted text used for a fact that matters.

## Minor Observations

- `isLoading` shows "Cargando…" but there is **no error state** — a failed query renders the empty state, misleading the user.
- `CheckIcon` `stroke="#fff"` doesn't invert in dark mode — the glyph goes low-contrast on light-sage success.
- `.compra__count` pill (`muted` on `surface-2`) is the weakest legible pair; passes AA but barely in dark mode.
- No `maxlength` on add/edit inputs — a dictated paragraph would break the row layout.
- "Añadir ítem…" uses the anglicism "ítem" amid otherwise clean Spanish; "¿Qué falta comprar?" would read warmer.
- No keyboard shortcut to add/toggle; Enter-to-add is the only accelerator.
- The destructive "Limpiar" and the disclosure toggle share one flex header row with no visual separation.
