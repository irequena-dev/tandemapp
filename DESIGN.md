<!-- FOUNDATION: first-pass visual system, composed before UI exists. The color/type/spacing tokens are real and ready to build with. Component specs are synthesized from best practice — re-run `$impeccable document` once real screens are built to capture actual components and generate refined tokens. -->
---
name: Tándem
description: Calm, glanceable PWA that shares the logistical mental load of parenting across a Familia.
colors:
  primary: "#00579a"
  primary-hover: "#00488a"
  accent: "#0f9293"
  ink: "#1f2730"
  muted: "#5b646f"
  bg: "#ffffff"
  surface: "#f5f7f9"
  surface-2: "#edf0f4"
  border: "#dbdee2"
  success: "#348f4f"
  warning: "#d79628"
  danger: "#c53637"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 5vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
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

The system is built on restraint. Surfaces are quiet and near-neutral; a single calm indigo carries the brand and marks only the things that genuinely need attention. It is adult and plain-spoken — it is *about* children but used *by* adults, and it treats them as the capable people they are. Color, motion, and weight are spent deliberately, never as decoration. The read path is optimized before the write path.

It explicitly rejects three things: the **cold corporate SaaS dashboard** (no navy/gray enterprise palette, no wall of KPI tiles), the **childish/cutesy "kids app"** (no baby pastels, no cartoon mascots, no rounded-everything), and the **cluttered productivity app** (no dense feature-stuffed surfaces that overwhelm). Calm is the product.

**Key Characteristics:**
- One calm indigo, spent sparingly; neutral surfaces carry the bulk.
- Glanceable first: state is legible in ~3 seconds, one-handed, in sun or a dark room.
- Adult and plain, never cute, never corporate.
- Flat and quiet at rest; depth and motion only when something is genuinely transient.
- Light and dark are equal first-class citizens.

## 2. Colors

A near-neutral cool-gray canvas with a single trustworthy indigo and a calm teal accent; semantic colors are reserved strictly for domain state.

### Primary
- **Trusted Indigo** (`#00579a` / `oklch(0.45 0.13 250)`): The brand. Primary actions, active navigation, links, selection. Carries white text (7.4:1). Used on ≤10% of any screen — its scarcity is what makes it read as "this matters." Hover deepens to **Indigo Deep** (`#00488a` / `oklch(0.40 0.13 250)`).

### Secondary
- **Calm Teal** (`#0f9293` / `oklch(0.60 0.10 195)`): The accent — a second brand color, distinct from indigo in hue and lightness. Used for quiet emphasis, secondary links, and informational pills. Never competes with primary for the same action.

### Neutral
- **Ink** (`#1f2730` / `oklch(0.27 0.02 250)`): Body and heading text. 15:1 on `bg` — the body color leans toward ink, never washed-out gray.
- **Muted** (`#5b646f` / `oklch(0.50 0.02 250)`): Secondary text, metadata, captions. 6:1 on `bg` — still comfortably AA for normal text; never used for primary reading.
- **Background** (`#ffffff` / `oklch(1 0 0)`): Pure white app canvas in light mode.
- **Surface** (`#f5f7f9` / `oklch(0.975 0.004 250)`): Cards, grouped list sections, sheets — a faint cool lift off the canvas.
- **Surface-2** (`#edf0f4` / `oklch(0.955 0.006 250)`): Inset fields, secondary buttons, neutral pills, pressed states.
- **Border** (`#dbdee2` / `oklch(0.90 0.006 250)`): Hairline dividers and field strokes. 1px only.

### Semantic (domain state)
- **Success / done** (`#348f4f`): comprado, hecho, Pauta finalizada cleanly.
- **Warning / due-soon** (`#d79628`): an Administración or Evento approaching.
- **Danger / overdue** (`#c53637`): overdue, error, destructive confirm.

### Dark mode
Same hues, recomposed (canonical values in `.impeccable/design.json`):
- **bg** `#0e1217`, **surface** `#161b21`, **surface-2** `#1e252c`, **border** `#2e343a`.
- **ink** `#ebeff2` (16:1), **muted** `#9299a1` (6.5:1).
- **primary** lightens to `#64a1ee` (`oklch(0.70 0.13 255)`); on dark mode the primary fill takes **dark** text (`bg` on primary = 7:1), not white.
- **accent** `#41b2b2`.

### Named Rules
**The Quiet Indigo Rule.** The primary indigo covers ≤10% of any screen. Surfaces stay neutral. If everything is colored, nothing reads as urgent — and urgency is the only thing color is allowed to signal.

**The State-Is-Never-Color-Alone Rule.** pending/comprado, activa/finalizada, due/overdue must always pair their color with an icon, label, or shape. Color is reinforcement, never the sole carrier.

## 3. Typography

**Display / Body / Label Font:** Inter (with `system-ui, sans-serif` fallback) — one family, used throughout.

**Character:** A single neutral, humanist-leaning sans across the entire UI. Hierarchy comes from weight and size, not from a second typeface. Inter is chosen for its exceptional small-size legibility on phones and its true tabular figures — essential for **Medidas**, **Tallas**, doses, and dates that must read precisely. The pairing is calm and unfussy: no display flourish, no character that competes with the data.

### Hierarchy
- **Display** (600, `clamp(1.75rem, 5vw, 2.25rem)`, lh 1.1, ls -0.02em): Page title only. Deliberately modest — this is an app, not a landing page.
- **Headline** (600, 1.375rem, lh 1.2): Section and card headers, the day's heading in the agenda.
- **Title** (600, 1.0625rem, lh 1.3): List-item titles, **Hijo** names, **Pauta** names.
- **Body** (400, 1rem, lh 1.55): Primary content and descriptions. Cap measure at 65–75ch.
- **Label** (500, 0.8125rem, lh 1.3, ls 0.01em): Metadata, captions, pill text, field labels.

### Named Rules
**The One Voice Rule.** One family, full stop. Build hierarchy with weight (400/500/600) and size, never by introducing a second typeface.

**The Tabular Numbers Rule.** Every domain figure — height in cm, weight in kg, **Talla** label, dose, interval, date, time — renders with `font-variant-numeric: tabular-nums` so columns align and numbers never jitter as they update.

## 4. Elevation

Flat by default, with tonal layering doing the work of separation: `bg` → `surface` → `surface-2` establish depth through value, not shadow. Shadows are reserved exclusively for genuinely transient or floating layers (bottom sheets, the FAB, toasts, an actively-dragged row) — never on resting cards or list items.

### Shadow Vocabulary
- **Floating** (`box-shadow: 0 8px 24px -8px rgba(15, 23, 32, 0.18)`): Bottom sheets, popovers, FAB. Soft, low, never harsh.
- **Toast** (`box-shadow: 0 4px 16px -4px rgba(15, 23, 32, 0.22)`): Transient confirmations.

### Named Rules
**The Flat-At-Rest Rule.** A resting surface has no shadow — only a tonal step or a 1px border. If it casts a shadow, it must be something the user summoned (a sheet, a menu) or something in motion. A 2014-style soft drop shadow on a static card is forbidden.

## 5. Components

### Buttons
- **Shape:** Gently rounded (10px, `{rounded.md}`). Pills (`{rounded.pill}`) only for small status chips, never for primary actions.
- **Primary:** `primary` fill, white text in light mode / dark text in dark mode, 12px×20px padding, **min height 48px**. Used for the single most important action on a surface.
- **Secondary:** `surface-2` fill, `ink` text — a quiet tonal button for secondary actions. No outline-only ghost buttons as the default; tonal reads calmer.
- **Hover / Focus:** Primary deepens to `primary-hover`; all interactive elements show a 2px `primary` focus ring at `:focus-visible` with a 2px offset. Press: subtle `scale(0.98)`, ≤120ms.

### Status pills (signature)
- **Style:** `surface-2` background, `ink` text, pill radius, 4px×10px, label type. State pills tint toward their semantic color at low chroma and **always carry an icon or word** (a check for comprado, a clock for due) — never color alone.

### Cards / Containers
- **Corner Style:** 14px (`{rounded.lg}`).
- **Background:** `surface` on `bg`; nested fields use `surface-2`. Never nest a card inside a card.
- **Shadow Strategy:** None at rest (see Elevation). Separation via tonal step + optional 1px `border`.
- **Internal Padding:** 16px (`{spacing.lg}`).

### Inputs / Fields
- **Style:** `bg` fill, 1px `border`, 10px radius, **min height 48px**, comfortable 12–14px padding.
- **Focus:** Border shifts to `primary` plus a soft 2px `primary` ring. No glow.
- **Error:** Border and helper text in `danger`; the message is plain and tells the Miembro how to fix it.

### Navigation
- **Mobile (primary):** A bottom tab bar — thumb-reachable — with the core surfaces (Dashboard, Compra, Crecimiento, Salud, Agenda). Active tab in `primary` with a filled icon + label; inactive in `muted` with an outline icon. **The Familia switcher (`OrganizationSwitcher`) and `UserButton` live in a top bar**, not the tab bar.
- **Tap targets:** Every interactive element is ≥44px in its smallest dimension with adequate spacing.

### Floating action button (optional)
- A `primary` circular FAB for the primary add action on list surfaces, bottom-right, above the tab bar, carrying the `Floating` shadow.

## 6. Do's and Don'ts

### Do:
- **Do** keep the primary indigo to ≤10% of any screen; let neutral surfaces carry the bulk (The Quiet Indigo Rule).
- **Do** pair every state with an icon or word, never color alone (The State-Is-Never-Color-Alone Rule).
- **Do** use `tabular-nums` for every Medida, Talla, dose, interval, date, and time.
- **Do** keep body text on `ink` (15:1), reserve `muted` for genuine secondary text only.
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
- **Don't** over-round: cards top out at 14px; full pills are for small chips only, never cards or primary buttons.
- **Don't** pair a 1px border with a wide soft drop shadow on the same element; pick one.
- **Don't** gate content visibility on a reveal animation, and always honor `prefers-reduced-motion`.
