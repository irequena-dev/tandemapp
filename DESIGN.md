<!-- Warm sage system (DESIGN-V2). Color/type/spacing tokens are live in frontend/src/index.css — that file is the runtime source of truth; keep this doc in sync with it. -->
---
name: Tándem
description: Calm, glanceable PWA that shares the logistical mental load of parenting across a Familia.
colors:
  primary: "#5c794f"
  primary-hover: "#4d6742"
  accent: "#5c794f"
  attn: "#bb6234"
  attn-solid: "#a9542b"
  ink: "#2a261f"
  muted: "#6d645a"
  bg: "#ece6da"
  surface: "#fffaf3"
  surface-2: "#efe7d8"
  border: "#e3d9c7"
  success: "#4d6742"
  warning: "#b07a23"
  danger: "#b6443a"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(1.625rem, 1.3rem + 1.4vw, 2rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.bg}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.bg}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    height: "48px"
  status-pill:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
    height: "48px"
---

# Design System: Tándem

## 1. Overview

**Creative North Star: "The Shared Ledger on the Fridge Door"**

Tándem is the calm, trustworthy place where a Familia keeps the facts that would otherwise live in someone's overloaded head: what's left to buy, what **Talla** fits each **Hijo** now, when the next **Administración** is due and who gave it, what's on the agenda today. The interface behaves like a well-kept note on the fridge — instantly readable at a glance, honest, never demanding. A tired **Miembro** opens it one-handed, gets the answer or confirms the action in a few seconds, and closes it relieved.

The system is built on restraint and warmth. The canvas is a warm greige field; cream-white cards lift off it, and a single grounded sage carries the brand and marks only the things that genuinely need a Miembro. A soft optical serif (Fraunces) gives the screen titles and wordmark a human, lived-in warmth, while a humanist sans (Hanken Grotesk) keeps every label, control, and number plain and legible. It is adult and plain-spoken — it is *about* children but used *by* adults, and it treats them as the capable people they are. Color, motion, and weight are spent deliberately, never as decoration. The read path is optimized before the write path.

It explicitly rejects three things: the **cold corporate SaaS dashboard** (no navy/gray enterprise palette, no wall of KPI tiles), the **childish/cutesy "kids app"** (no baby pastels, no cartoon mascots, no rounded-everything), and the **cluttered productivity app** (no dense feature-stuffed surfaces that overwhelm). Calm is the product.

**Key Characteristics:**
- Warm neutrals carry the bulk; one grounded sage, spent sparingly, marks what matters. A clay attention hue is reserved for "needs you now".
- Fraunces (serif display) + Hanken Grotesk (humanist sans) — warmth from the title voice, legibility from the body voice.
- Glanceable first: state is legible in ~3 seconds, one-handed, in sun or a dark room.
- Adult and plain, never cute, never corporate.
- Flat and quiet at rest; depth and motion only when something is genuinely transient.
- Light and dark are equal first-class citizens.

## 2. Colors

A warm, grounded palette. Warm neutrals (greige field, cream-white cards) — never corporate gray. A single grounded **sage** carries the brand, primary actions, and "handled" states. A single **clay attention** hue is used *only* for "needs you now". Hijo identity uses warm avatar tints, not status colors.

### Primary
- **Grounded Sage** (`#5c794f` / `oklch(0.55 0.07 138)`): The brand. Primary actions, active navigation, links, selection. Carries white text (4.88:1, AA). Used on ≤10% of any screen — its scarcity is what makes it read as "this matters." Hover deepens to **Sage Deep** (`#4d6742`, white text 6.3:1). There is no competing second accent: one brand hue, full stop.

### Attention
- **Clay** (`#bb6234` / `oklch(0.58 0.12 47)`): reserved strictly for "needs you now" — a due **Administración**, an overdue **Ítem**. Used sparingly; never decoration. As a tint with dark **clay-ink** text (`#8a4521`) or as a solid fill that must darken to `#a9542b` so white text clears AA (raw `#bb6234` on white is only 4.28:1).

### Neutral
- **Ink** (`#2a261f`): Body and heading text. ~12:1 on `bg`, ~14.5:1 on `surface` — the body color leans toward ink, never washed-out gray.
- **Muted** (`#6d645a`): Secondary text, metadata, captions. 4.67:1 on `bg`, 5.58:1 on `surface` — AA for normal text; never used for primary reading. Prefer placing muted text on `surface`, where it has more room.
- **Background** (`#ece6da`): warm greige field — a deliberate mid-light surface, not near-white paper. Cards lift off it.
- **Surface** (`#fffaf3`): cream-white cards, grouped list sections, sheets — the raised tier.
- **Surface-2** (`#efe7d8`): inset fields, secondary buttons, neutral pills, skeletons, pressed states.
- **Border** (`#e3d9c7`): hairline dividers and field strokes. 1px only.

### Semantic (domain state)
- **Success / done** (`#4d6742`): comprado, hecho, Pauta finalizada cleanly — the sage family.
- **Warning / due-soon** (`#b07a23`): an Administración or Evento approaching.
- **Danger / overdue** (`#b6443a`): overdue, error, destructive confirm.

### Dark mode
Warm and recomposed, not an inverted gray (canonical values in `frontend/src/index.css` / `.impeccable/design.json`):
- **bg** `#1b1814` (warm near-black), **surface** `#25221c`, **surface-2** `#201d17`, **border** `#343029`.
- **ink** `#ece5d8` (14:1), **muted** `#a49a8d` (6.4:1).
- **primary** lightens to sage `#93b382`; on dark the primary fill takes **dark** text (`#141310` on primary = 8:1), not white.
- **attn** `#dc8d56` (dark text on solid = 7:1).

### Named Rules
**The Quiet Sage Rule.** The primary sage covers ≤10% of any screen. Surfaces stay warm-neutral. If everything is colored, nothing reads as urgent — and urgency is the only thing color is allowed to signal.

**The State-Is-Never-Color-Alone Rule.** pending/comprado, activa/finalizada, due/overdue must always pair their color with an icon, label, or shape. Color is reinforcement, never the sole carrier.

## 3. Typography

**Two voices, paired on a contrast axis:**
- **Fraunces** (soft optical serif; `Georgia` fallback) — display warmth: the wordmark and screen titles (apply the `.ds-display` utility). Carries personality without shouting.
- **Hanken Grotesk** (warm humanist sans; `system-ui` fallback) — everything else: section headers, card/item titles, body, labels, buttons, and all domain numbers. Chosen for small-size legibility on phones and true tabular figures.

**Character:** The serif gives titles a human, lived-in warmth; the sans keeps the working UI plain and precise. This is a real pairing on a contrast axis (serif + humanist sans), never two lookalike sans. A display serif never appears in UI labels, buttons, or data.

### Hierarchy
- **Display** (Fraunces, 500, `clamp(1.625rem, 1.3rem + 1.4vw, 2rem)`, lh 1.1, ls -0.01em): Screen titles and wordmark only. Deliberately modest — this is an app, not a landing page.
- **Headline** (Hanken, 600, 1.375rem, lh 1.2): Section and card headers, the day's heading in the agenda.
- **Title** (Hanken, 600, 1.0625rem, lh 1.3): List-item titles, **Hijo** names, **Pauta** names.
- **Body** (Hanken, 400, 1rem, lh 1.55): Primary content and descriptions. Cap measure at 65–75ch.
- **Label** (Hanken, 500, 0.8125rem, lh 1.3, ls 0.01em): Metadata, captions, pill text, field labels.

### Named Rules
**The Two-Voice Rule.** Fraunces for screen titles + wordmark; Hanken for the entire working UI. Never reach for the serif in a button, label, or data cell — and never introduce a third family.

**The Tabular Numbers Rule.** Every domain figure — height in cm, weight in kg, **Talla** label, dose, interval, date, time — renders with `font-variant-numeric: tabular-nums` so columns align and numbers never jitter as they update.

## 4. Elevation

Flat by default, with tonal layering doing the work of separation: `bg` → `surface` → `surface-2` establish depth through value, not shadow. Shadows are reserved exclusively for genuinely transient or floating layers (bottom sheets, the FAB, toasts, an actively-dragged row) — never on resting cards or list items.

### Shadow Vocabulary
- **Floating** (`box-shadow: 0 8px 24px -8px rgba(43, 34, 22, 0.2)`): Bottom sheets, popovers, FAB. Soft, low, warm-tinted, never harsh.
- **Toast** (`box-shadow: 0 4px 16px -4px rgba(43, 34, 22, 0.24)`): Transient confirmations.

### Named Rules
**The Flat-At-Rest Rule.** A resting surface has no shadow — only a tonal step or a 1px border. If it casts a shadow, it must be something the user summoned (a sheet, a menu) or something in motion. A 2014-style soft drop shadow on a static card is forbidden.

## 5. Components

### Buttons
- **Shape:** Gently rounded (12px, `{rounded.md}`). Pills (`{rounded.pill}`) only for small status chips, never for primary actions.
- **Primary:** `primary` fill, white text in light mode / dark text in dark mode, 12px×20px padding, **min height 48px**. Used for the single most important action on a surface.
- **Secondary:** `surface-2` fill, `ink` text — a quiet tonal button for secondary actions. No outline-only ghost buttons as the default; tonal reads calmer.
- **Hover / Focus:** Primary deepens to `primary-hover`; all interactive elements show a 2px `primary` focus ring at `:focus-visible` with a 2px offset. Press: subtle `scale(0.98)`, ≤120ms.

### Status pills (signature)
- **Style:** `surface-2` background, `ink` text, pill radius, 4px×10px, label type. State pills tint toward their semantic color at low chroma and **always carry an icon or word** (a check for comprado, a clock for due) — never color alone.

### Cards / Containers
- **Corner Style:** 20px (`{rounded.lg}`).
- **Background:** `surface` (cream-white) on `bg` (greige); nested fields use `surface-2`. Never nest a card inside a card.
- **Shadow Strategy:** None at rest (see Elevation). Separation via tonal step + optional 1px `border`.
- **Internal Padding:** 16px (`{spacing.lg}`).

### Inputs / Fields
- **Style:** `bg` fill, 1px `border`, 12px radius, **min height 48px**, comfortable 12–14px padding.
- **Focus:** Border shifts to `primary` plus a soft 2px `primary` ring. No glow.
- **Error:** Border and helper text in `danger`; the message is plain and tells the Miembro how to fix it.

### Navigation
- **Mobile (primary):** A bottom tab bar — thumb-reachable — with the core surfaces (Dashboard, Compra, Crecimiento, Salud, Agenda). Active tab in `primary` with a filled icon + label; inactive in `muted` with an outline icon. **The Familia switcher (`OrganizationSwitcher`) and `UserButton` live in a top bar**, not the tab bar.
- **Tap targets:** Every interactive element is ≥44px in its smallest dimension with adequate spacing.

### Floating action button (optional)
- A `primary` circular FAB for the primary add action on list surfaces, bottom-right, above the tab bar, carrying the `Floating` shadow.

## 6. Do's and Don'ts

### Do:
- **Do** keep the primary sage to ≤10% of any screen; let warm-neutral surfaces carry the bulk (The Quiet Sage Rule). Reserve clay strictly for "needs you now".
- **Do** pair every state with an icon or word, never color alone (The State-Is-Never-Color-Alone Rule).
- **Do** use `tabular-nums` for every Medida, Talla, dose, interval, date, and time.
- **Do** keep body text on `ink` (~12:1+), reserve `muted` for genuine secondary text only; prefer `muted` on `surface` over `bg`.
- **Do** make every tap target ≥44px and reachable one-handed; primary actions live in thumb range.
- **Do** keep surfaces flat at rest; reserve shadow for sheets, FAB, and toasts.
- **Do** treat dark mode as a first-class design, verified at AA, not an inverted afterthought.
- **Do** use the ubiquitous language in the UI (Familia, Hijo, Medida, Talla, Ítem de compra, Evento, Visita médica, Pauta, Administración).

### Don't:
- **Don't** build a generic SaaS dashboard: no navy/gray enterprise palette, no wall of hero-metric / KPI tiles.
- **Don't** go childish or cutesy: no baby pastels, no cartoon mascots, no rounded-everything, no playful illustrations.
- **Don't** make a cluttered productivity app: don't show everything at once — surface what matters now and let the rest recede.
- **Don't** use a colored side-stripe (`border-left` > 1px) as a card/list accent.
- **Don't** use gradient text (`background-clip: text`) or decorative glassmorphism.
- **Don't** over-round: cards top out at 20px (`{rounded.lg}`), controls at 12px; full pills are for small chips, avatars, and the like, never cards or primary buttons.
- **Don't** pair a 1px border with a wide soft drop shadow on the same element; pick one.
- **Don't** gate content visibility on a reveal animation, and always honor `prefers-reduced-motion`.
