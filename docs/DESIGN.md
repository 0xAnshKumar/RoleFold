---
# gstack: design-md-format=spec
name: Hunt (working name)
version: 2
description: Signed in blue. Proof you can hold. An original document, not a decorated one; blue-ink signatures, tagged evidence, highlighted proof, security-print texture, verdicts in words.
colors:
  bg: "#F9F8F3"
  bg-sunken: "#F3F0E9"
  surface: "#FEFDFB"
  text: "#181F30"
  text-muted: "#535B6C"
  line: "#E2DED5"
  line-strong: "#7B808D"
  accent: "#2B4BAC"
  accent-hover: "#1F3B94"
  accent-tint: "#E8EFFC"
  on-accent: "#F9F8F3"
  proof: "#FEE657"
  on-proof: "#181F30"
  tag: "#ECD8B6"
  supported: "#206B38"
  supported-bg: "#DFF6E2"
  partial: "#8D591D"
  partial-bg: "#FCEDCD"
  missing: "#5D646F"
  missing-bg: "#EFF2F6"
  conflict: "#B32322"
  conflict-bg: "#FFE8E6"
  mk-panel: "#17234B"
  night-bg: "#10141D"
  night-surface: "#181D27"
  night-text: "#F0EEE9"
  night-accent: "#96B6FE"
typography:
  display: { fontFamily: Newsreader, fontWeight: 400, italicAccent: true, letterSpacing: -0.03em to -0.01em }
  ui: { fontFamily: Atkinson Hyperlegible Next, fontWeight: "400/600", fontSize: 1rem, lineHeight: 1.6 }
  mono: { fontFamily: IBM Plex Mono, fontWeight: "400/500", use: verbatim quotes, fact IDs, dates }
  devanagari: { fontFamily: Noto Sans Devanagari, lineHeight: 1.75 }
rounded: { xs: 4px, sm: 8px, md: 12px, lg: 16px, xl: 24px, 2xl: 32px, full: 9999px }
spacing: [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 120]
---

# Hunt: Design system v2

**Status:** approved direction (owner, 2026-11-06: full redesign at the craft.do quality bar, replacing v1).
This file is the authority for every pixel in `src/`. The tokens in section 2 are the exact values to put
in `src/app/globals.css`. Research behind it: `docs/design-research/craft-teardown.md` (technique study),
`docs/design-research/best-practices.md` (motion, nav, UX, India devices). Asset generators:
`docs/design-research/notes/brand-assets.md`. Ask the owner before departing from anything here.

---

## 1. Identity and principles

### 1.1 North star: "Proof you can hold"

**Metaphor: signed in blue.** In India everyone knows how to tell an original from a copy: the original is
signed in blue ink, it carries a stamp or seal, and important papers (certificates, stamp paper, banknotes)
are printed with fine interlocking line patterns that can't be faked. Hunt's resume is that kind of
document. Every line is an original: signed by the person (they confirmed it), tagged with where it came
from, and the proof is highlighted on demand.

This is ours and not craft's: craft is a sky-and-torn-paper collage of pastel scraps. Hunt is a clean
**certified document**: cream bond paper, blue-black ink, a ballpoint-blue signature colour, manila evidence
tags, a yellow proof highlighter, and security-print linework (guilloche) on marketing surfaces only.

### 1.2 Signature devices (each one means something; never use them as decoration)

| Device | What it is | What it means | Where |
|---|---|---|---|
| **Proof mark** (the signature) | Yellow highlighter band behind verbatim text, drawn left to right | "This exact text is the evidence" | Source lines of facts, quotes from job postings, the one italic accent word in a landing headline |
| **Fact tag** | Small manila tag with a punched hole, mono ID (`F-15`) and date | "This line came from this fact" | Resume editor, requirement rows, confirm queue, landing mockups |
| **Blue signature line** | "Confirmed by you · 12 Oct" in the display serif italic, accent blue | "You signed this" | Confirmed facts, confirmed rows in the queue |
| **Verdict seal** | Round seal with a guilloche ring tinted to the verdict, verdict in words | "We checked; here is the honest answer" | Job check page (one per page), landing mockup |
| **Security print** | Guilloche rosette and wave linework + one shared grain | "Original, hard to fake" | Landing hero panel, CTA band, footer. **Never in the app.** |

### 1.3 Principles

1. **Proof is shown, not promised.** Any claim (a resume line, a requirement verdict) can reveal its
   source in one tap or focus. If we can't show proof, we say "no confirmed fact yet", never fake it.
2. **Words, never numbers that judge.** No percentages, gauges, rings, stars or scores for fit, anywhere.
   Counts of tasks are fine ("12 of 31 confirmed"); counts that grade the person are not.
3. **The product is the illustration.** Marketing visuals are real DOM built from app components and
   sample data, never screenshots or stock art. They show the visitor's real date. No invented users,
   testimonials, logos or user counts.
4. **Built for a ₹12k Android on slow 4G.** Every choice passes the budgets in 6.6. Texture, glass and
   blur are marketing-only luxuries with solid fallbacks.
5. **Two volumes.** Landing = expressive (inset panel, serif display, security print, grain, live
   mockups). App = calm and dense (flat surfaces, hairlines, layered soft shadows, no texture).
6. **Motion explains a state change.** It answers "what just happened?" (opened, confirmed, linked,
   moved). Nothing moves because the page scrolled.

### 1.4 Owner rules (binding, checked in review)

- No scroll-linked, pinned or scrubbed animation, no scroll-jacking, no parallax, **no in-view reveals**.
  Every section is fully painted on arrival. No scroll listeners that change styles.
- `prefers-reduced-motion: reduce` is honoured everywhere, including Motion/JS loops (6.1).
- **Never a `cursor:` declaration** anywhere in `src/` (CSS, inline styles, Tailwind-like utilities).
- No percentages, gauges or scores for job fit or resume quality.
- No eyebrow/kicker labels above headings. Icons are authored SVG, not text glyphs or emoji.
- Highlighter yellow is only the proof mark. Never a button, badge, background band or promotion.
- `backdrop-filter` only on navs: the landing nav and the app's nav bar + phone tab bar (owner call, 2026-11-21), each with a solid `--surface` fallback (`@supports not` and `.save-data`) and solid while a panel is open.
- Do not copy craft.do's identity: not their fonts, pastel palette, torn paper, clouds, halftone, giant
  outlined wordmark, pill-everything, copy or assets. We borrow techniques only (list in 8.2).

---

## 2. Tokens

Put these in `src/app/globals.css` exactly. Hex is the fallback; oklch overrides it where supported.
Components use **semantic** tokens only. Values were computed and contrast-checked with a script
(oklch → sRGB, WCAG 2 ratio) on 2026-11-06; ratios are listed in 2.1.3.

### 2.1 Colour

#### 2.1.1 CSS (light is the default; night is opt-in)

```css
:root {
  color-scheme: light;
  /* ground */
  --bg: #F9F8F3;            /* bond paper: page canvas */
  --bg-sunken: #F3F0E9;     /* wells: preview stage, skeletons, code */
  --surface: #FEFDFB;       /* cards, bars, inputs, sheets */
  --surface-raised: #FEFDFB;/* menus/popovers (same as surface in light; differs at night) */
  --paper-white: #FFFFFF;   /* the resume sheet only: a real document is white */
  /* ink */
  --text: #181F30;          /* blue-black ink */
  --text-muted: #535B6C;
  --line: #E2DED5;          /* hairlines, dividers: decorative only (1.3:1) */
  --line-strong: #7B808D;   /* control borders (≥3:1) */
  /* accent: ballpoint blue = "signed, original" */
  --accent: #2B4BAC;
  --accent-hover: #1F3B94;
  --accent-tint: #E8EFFC;   /* selected chip, active row */
  --on-accent: #F9F8F3;
  --focus: #2B4BAC;
  /* proof + tags */
  --proof: #FEE657;         /* the proof mark. Nothing else is yellow. */
  --on-proof: #181F30;
  --tag: #ECD8B6;           /* manila */
  --on-tag: #181F30;
  /* verdict / status */
  --supported: #206B38;  --supported-bg: #DFF6E2;
  --partial: #8D591D;    --partial-bg: #FCEDCD;
  --missing: #5D646F;    --missing-bg: #EFF2F6;   /* calm on purpose: missing proof is not a missing skill */
  --conflict: #B32322;   --conflict-bg: #FFE8E6;
  --danger: var(--conflict);                       /* destructive buttons, field errors */
  /* inverse (toasts, tooltips) */
  --inverse-bg: #181F30;
  --inverse-text: #F9F8F3;
  --scrim: rgb(16 20 29 / 0.45);
  /* marketing only (landing is always light) */
  --mk-panel: #17234B;      /* deep registry indigo: hero + CTA band */
  --mk-line: #2B3A67;       /* guilloche linework on the panel */
  --mk-text: #F9F8F3;
  --mk-muted: #B5BED2;
  --mk-footer: #10141D;
  /* shadow ink: rgb channels used by elevation tokens */
  --shadow-ink: 24 31 48;
}

@supports (color: oklch(0% 0 0)) {
  :root {
    --bg: oklch(97.8% 0.007 90);
    --bg-sunken: oklch(95.5% 0.010 88);
    --surface: oklch(99.5% 0.003 90);
    --surface-raised: oklch(99.5% 0.003 90);
    --text: oklch(24% 0.035 268);
    --text-muted: oklch(47% 0.03 268);
    --line: oklch(90% 0.012 85);
    --line-strong: oklch(60% 0.02 268);
    --accent: oklch(45% 0.16 266);
    --accent-hover: oklch(39% 0.15 266);
    --accent-tint: oklch(95% 0.02 266);
    --on-accent: oklch(97.8% 0.007 90);
    --focus: oklch(45% 0.16 266);
    --proof: oklch(92% 0.16 100);
    --on-proof: oklch(24% 0.035 268);
    --tag: oklch(89% 0.05 80);
    --on-tag: oklch(24% 0.035 268);
    --supported: oklch(47% 0.11 150);  --supported-bg: oklch(95% 0.035 150);
    --partial: oklch(51% 0.10 65);     --partial-bg: oklch(95% 0.045 85);
    --missing: oklch(50% 0.02 260);    --missing-bg: oklch(96% 0.006 260);
    --conflict: oklch(50% 0.18 27);    --conflict-bg: oklch(95% 0.025 25);
    --inverse-bg: oklch(24% 0.035 268);
    --inverse-text: oklch(97.8% 0.007 90);
    --mk-panel: oklch(27% 0.075 268);
    --mk-line: oklch(36% 0.08 268);
    --mk-text: oklch(97.8% 0.007 90);
    --mk-muted: oklch(80% 0.03 268);
    --mk-footer: oklch(19% 0.02 268);
  }
}

/* Night: app only. Set by the theme setting (Light / Night / System). "System" is resolved to
   "light" or "night" by a ~200-byte inline <head> script reading matchMedia before first paint,
   so only one night block exists. */
[data-theme="night"] {
  color-scheme: dark;
  --bg: #10141D;
  --bg-sunken: #0B0E16;
  --surface: #181D27;
  --surface-raised: #1F2531;
  --paper-white: #FFFFFF;   /* the resume sheet stays white: it is the printed document */
  --text: #F0EEE9;
  --text-muted: #B3B7C1;
  --line: #313540;
  --line-strong: #757A87;
  --accent: #96B6FE;
  --accent-hover: #B8CDFD;
  --accent-tint: #222D47;
  --on-accent: #10141D;
  --focus: #96B6FE;
  --proof: #EFD956;
  --on-proof: #181F30;      /* dark ink on yellow in both themes */
  --tag: #594B34;
  --on-tag: #F0EEE9;
  --supported: #83D494;  --supported-bg: #1A3520;
  --partial: #EDBF71;    --partial-bg: #3F2C10;
  --missing: #AAB2BE;    --missing-bg: #1E2228;
  --conflict: #F98F84;   --conflict-bg: #4E201E;
  --inverse-bg: #F0EEE9;
  --inverse-text: #10141D;
  --scrim: rgb(0 0 0 / 0.6);
  --shadow-ink: 0 0 0;
}
@supports (color: oklch(0% 0 0)) {
  [data-theme="night"] {
    --bg: oklch(19% 0.02 268);
    --bg-sunken: oklch(16.5% 0.018 268);
    --surface: oklch(23% 0.022 268);
    --surface-raised: oklch(26.5% 0.024 268);
    --text: oklch(95% 0.008 90);
    --text-muted: oklch(78% 0.015 268);
    --line: oklch(33% 0.02 268);
    --line-strong: oklch(58% 0.02 268);
    --accent: oklch(78% 0.11 266);
    --accent-hover: oklch(85% 0.07 266);
    --accent-tint: oklch(30% 0.05 266);
    --on-accent: oklch(19% 0.02 268);
    --focus: oklch(78% 0.11 266);
    --proof: oklch(88% 0.15 100);
    --tag: oklch(42% 0.04 80);
    --on-tag: oklch(95% 0.008 90);
    --supported: oklch(80% 0.12 150);  --supported-bg: oklch(30% 0.05 150);
    --partial: oklch(83% 0.11 80);     --partial-bg: oklch(31% 0.05 75);
    --missing: oklch(76% 0.02 260);    --missing-bg: oklch(25% 0.012 260);
    --conflict: oklch(76% 0.13 27);    --conflict-bg: oklch(31% 0.07 25);
    --inverse-bg: oklch(95% 0.008 90);
    --inverse-text: oklch(19% 0.02 268);
  }
}
```

Gradients: always interpolate `in oklab` (`linear-gradient(in oklab, …)`) where supported; give a plain
two-stop fallback before it.

#### 2.1.2 Roles

| Role | Token | Rule |
|---|---|---|
| Page canvas | `--bg` | App and landing background. Never pure white. |
| Content surface | `--surface` | Cards, bars, inputs, sheets. One level of surface: never a card inside a card. |
| Primary action, links, selection | `--accent` | Ballpoint blue. One primary button per view. Links are `--text` with an accent underline; hover turns them accent. |
| Proof | `--proof` on `--on-proof` | Only behind verbatim proof text. |
| Evidence tag | `--tag` | Only for fact tags. |
| Status / verdict | `--supported`, `--partial`, `--missing`, `--conflict` (+ `-bg`) | Always with an icon and a word. Colour is never the only signal. |
| Focus | `--focus` | 2px outline, 2px offset. On `--mk-panel`: `--mk-text`. |

**Verdict and status mapping** (data values from `src/lib/mock.ts`):

| Data value | Group / label shown | Token | Icon | Mark style |
|---|---|---|---|---|
| `supported`, `match` | **Proven** / "Proven", "Matches" | supported | check | tinted fill |
| `partial` | **Partly** / "Partly proven" | partial | half-circle | tinted fill |
| `no_evidence` | **Missing** / "No confirmed fact yet" | missing | dash | dashed 1px outline, no fill |
| `gap` | **Missing** / "Gap (you said so)" | missing | cross | tinted fill |
| `conflict` | Eligibility / "Doesn't match your preference" | conflict | alert | 1.5px solid border + tint |
| `unknown` | Eligibility / "Not stated in posting" | missing | question | outline |

| Verdict (seal) | Seal tint |
|---|---|
| Strong fit, Good fit with gaps | supported |
| Stretch | partial |
| Poor fit, Not enough detail in this posting | missing |
| Not eligible | conflict |

#### 2.1.3 Contrast record (WCAG 2, measured on the hex values)

| Pair | Light | Night |
|---|---|---|
| text on bg / surface | 15.5 / 16.2 | 15.9 / 14.6 |
| text-muted on bg / surface / sunken | 6.4 / 6.7 / 6.0 | 9.2 / 8.4 / 9.6 |
| accent on bg (links, outline buttons) | 7.3 | 9.1 |
| on-accent on accent / accent-hover | 7.3 / 9.4 | 9.1 / 11.5 |
| line-strong on surface / bg (control borders, ≥3) | 3.9 / 3.7 | 3.9 / 4.3 |
| on-proof on proof | 13.1 | 11.5 |
| on-tag on tag (muted on tag: 4.9) | 11.8 | 7.3 |
| supported / partial / missing / conflict on own `-bg` | 5.7 / 5.1 / 5.3 / 5.6 | 7.5 / 7.8 / 7.5 / 6.0 |
| same four on surface | 6.4 / 5.8 / 5.9 / 6.5 | 9.5 / 9.9 / 7.9 / 7.5 |
| mk-text / mk-muted on mk-panel | 14.3 / 8.2 | n/a |
| line on surface (decorative only) | 1.3 | 1.4 |

### 2.2 Typography

#### 2.2.1 Families (all OFL, all on `next/font/google`)

| Role | Family | Why |
|---|---|---|
| Display | **Newsreader** (Production Type), variable `wght` 200-800 + `opsz` 6-72, with italics | An editorial text serif with real optical sizes: sharp and engraved at 56-80px, sturdy at 22px. The italic is the "signature" voice for the accent word and the blue signature line. Not Untitled Serif, not the over-used Fraunces/Playfair/Instrument. |
| UI | **Atkinson Hyperlegible Next** (Braille Institute), 400 / 600 | Built for low vision: l/I/1 and O/0 are distinct, which matters for dates, IDs and salaries read on a cheap screen in sunlight. Humanist proportions sit well next to Noto Sans Devanagari. |
| Mono | **IBM Plex Mono**, 400 / 500 | For words copied exactly (posting quotes, source lines, fact IDs, dates). Reads like a typed record rather than code. Mono = "verbatim, not generated". |
| Devanagari | **Noto Sans Devanagari**, variable | For Hindi UI and Devanagari user text (names, colleges). Loaded only when needed. |

Dropped from v1: Archivo, Kalam, JetBrains Mono (see 9).

#### 2.2.2 Loading (`src/app/fonts.ts`)

```ts
import { Atkinson_Hyperlegible_Next, IBM_Plex_Mono, Newsreader, Noto_Sans_Devanagari } from "next/font/google";

export const display = Newsreader({ subsets: ["latin"], axes: ["opsz"], style: ["normal"], variable: "--font-display", display: "swap" });
// Italic is never preloaded: it sets one word per headline and the signature line; the metric-matched
// fallback makes its swap nearly invisible.
export const displayItalic = Newsreader({ subsets: ["latin"], axes: ["opsz"], style: ["italic"], variable: "--font-display-italic", display: "swap", preload: false });
export const ui = Atkinson_Hyperlegible_Next({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-ui", display: "swap" });
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap", preload: false });
export const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-deva", display: "swap", preload: false });
```

- Keep `adjustFontFallback` on (default) for every family: metric-matched fallbacks give CLS 0. (v1 turned
  it off for Atkinson; turn it back on and check the computed fallback.)
- Two `@font-face` families for Newsreader roman/italic is deliberate: the roman preloads, the italic
  does not. In CSS: `.italic-accent { font-family: var(--font-display-italic), var(--font-display), serif; font-style: italic; }`.
- **Check sizes after the first build** (`.next/static/media/*.woff2`): target Newsreader roman ≤ 60 KB,
  italic ≤ 50 KB, Atkinson ≤ 30 KB per weight, Plex Mono ≤ 25 KB per weight. If Newsreader with the
  `opsz` axis is over budget, drop `axes` and load `weight: ["400", "500"]` statics instead (you lose
  optical sizing; raise display tracking by +0.005em to compensate).
- **₹ (U+20B9)** is in the `devanagari` subset's range but not in Google's `latin` subset. Check whether
  Atkinson's `latin` file has ₹ (render "₹6.5 LPA", inspect with DevTools > Rendered fonts). If it does
  not, the font stack below falls through to `system-ui` (Android Roboto and Windows Segoe have ₹) before
  `--font-deva`, so salaries never pull the Devanagari file.

Stacks:

```css
:root {
  --ff-display: var(--font-display), "Iowan Old Style", Georgia, serif;
  --ff-ui: var(--font-ui), system-ui, var(--font-deva), sans-serif;
  --ff-mono: var(--font-mono), ui-monospace, "SF Mono", Menlo, monospace;
}
:lang(hi) { --ff-ui: var(--font-deva), var(--font-ui), system-ui, sans-serif; }
```

#### 2.2.3 Scale

Base 16px. Sizes in rem so 200% text zoom works. `font-optical-sizing: auto` on display text.

| Token | Family | Size (360px → 1440px) | Line height | Weight | Tracking | Use |
|---|---|---|---|---|---|---|
| `--t-hero` | display | `clamp(2.5rem, 1.55rem + 4.1vw, 5rem)` 40→80 | 1.0 | 400 | -0.03em | Landing H1 only |
| `--t-d1` | display | `clamp(2rem, 1.5rem + 2.2vw, 3.5rem)` 32→56 | 1.05 | 400 | -0.025em | Landing section H2 |
| `--t-d2` | display | `clamp(1.625rem, 1.4rem + 1vw, 2.25rem)` 26→36 | 1.12 | 400 | -0.02em | Landing H3, app page titles |
| `--t-d3` | display | 1.375rem (22) | 1.2 | 500 | -0.01em | Dialog titles, empty-state titles, seal verdict |
| `--t-h` | ui | 1.125rem (18) | 1.35 | 600 | -0.005em | App section headings |
| `--t-title` | ui | 1.0625rem (17) | 1.35 | 600 | 0 | Job titles on cards, fact card heads |
| `--t-lead` | ui | `clamp(1.0625rem, 1rem + 0.3vw, 1.25rem)` 17→20 | 1.55 | 400 | 0 | Landing lead, page intros |
| `--t-body` | ui | 1rem (16) | 1.6 | 400 | 0 | Body, inputs (never below 16px in inputs) |
| `--t-sm` | ui | 0.875rem (14) | 1.5 | 400 | 0.005em | Meta lines, helper text |
| `--t-label` | ui | 0.875rem (14) | 1.3 | 600 | 0.005em | Buttons, field labels, chips |
| `--t-xs` | ui | 0.8125rem (13) | 1.4 | 600 | 0.01em | Status marks, counts. Smallest text allowed. |
| `--t-tab` | ui | 0.75rem (12) | 1.2 | 600 | 0.01em | Bottom tab labels only (exception) |
| `--t-quote` | mono | 0.9375rem (15) | 1.6 | 400 | 0 | Verbatim quotes, source lines |
| `--t-id` | mono | 0.8125rem (13) | 1.3 | 500 | 0.02em, `tnum` | Fact IDs, dates, versions |

Rules:
- Display is weight 400 at large sizes; 500 only at `--t-d3`. No bold serif.
- One italic accent word per headline at most, set in `--font-display-italic`. On the landing the
  accent word also carries the proof mark. The app uses italic only for the blue signature line.
- Sans never has negative tracking below 18px (Atkinson is drawn with open spacing).
- Measure: body 60-72ch (`--w-prose: 68ch`); quotes 72ch max.
- `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs.
- Numbers in tables, salaries, dates: `font-variant-numeric: tabular-nums`.

#### 2.2.4 Devanagari and Indic rules

- `:lang(hi)` (set `lang="hi"` on `<html>` for the Hindi UI, and on any element holding Devanagari user
  text): line-height 1.75 for body, 1.4 for headings; `letter-spacing: 0` always (negative tracking breaks
  the shirorekha); never `text-transform: uppercase`; never italic.
- Hindi headings use `--font-deva` at 600, size × 0.85 of the Latin token (Devanagari reads larger), no
  serif. The italic accent word becomes upright with the proof mark only.
- Any block showing user-entered text uses line-height ≥ 1.6 so Devanagari matras never clip.
- Hindi strings run 20-30% longer: no fixed-width buttons, chips or tabs; let them wrap or grow.

### 2.3 Spacing

4px base. Tokens: `--sp-0-5: 2px; --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 20px;
--sp-6: 24px; --sp-8: 32px; --sp-10: 40px; --sp-12: 48px; --sp-16: 64px; --sp-20: 80px; --sp-30: 120px`.

| Rhythm | Phone | Desktop |
|---|---|---|
| Landing: between top-level blocks | 72px (`--sp-16` + 8) | 120px (`--sp-30`) |
| Landing: inside a block (heading → content) | 32px | 48-64px |
| App: between page sections | 32px | 40px |
| App: between related rows | 12px | 12-16px |
| Card padding | 16px | 20-24px |
| Page gutter | 16px | 24px (tablet), 32px (≥1024) |

### 2.4 Radius

`--r-xs: 4px` (marks, tag body, kbd) · `--r-sm: 8px` (small buttons, segmented items) · `--r-md: 12px`
(buttons, inputs, menu items) · `--r-lg: 16px` (cards, nav bar, toasts) · `--r-xl: 24px` (sheets, dialogs,
mockup frames, hero panel on phones) · `--r-2xl: 32px` (hero panel ≥1024) · `--r-full: 9999px` (chips,
avatar, seal, toggles).
Buttons are rounded rectangles, not pills. Nested radius = outer radius − gap.

### 2.5 Elevation (layered, low-alpha, ink-tinted)

```css
:root {
  --shadow-0: none;
  /* cards at rest */
  --shadow-1: 0 1px 2px rgb(var(--shadow-ink) / 0.06), 0 4px 12px -4px rgb(var(--shadow-ink) / 0.07);
  /* hover / raised cards, sticky bars over content */
  --shadow-2: 0 1px 2px rgb(var(--shadow-ink) / 0.06), 0 6px 16px -6px rgb(var(--shadow-ink) / 0.10),
              0 18px 32px -12px rgb(var(--shadow-ink) / 0.08);
  /* nav plate, menus, popovers, toasts */
  --shadow-3: 0 2px 4px -1px rgb(var(--shadow-ink) / 0.06), 0 12px 24px -6px rgb(var(--shadow-ink) / 0.12),
              0 32px 48px -16px rgb(var(--shadow-ink) / 0.10);
  /* dialogs, sheets */
  --shadow-4: 0 3px 10px rgb(var(--shadow-ink) / 0.08), 0 20px 40px -8px rgb(var(--shadow-ink) / 0.14),
              0 50px 80px -20px rgb(var(--shadow-ink) / 0.14);
  /* landing objects (DOM mockups): long, soft ambient occlusion */
  --shadow-object: 0 3px 10px rgb(var(--shadow-ink) / 0.08), 0 20px 40px rgb(var(--shadow-ink) / 0.05),
                   0 50px 40px rgb(var(--shadow-ink) / 0.02), 0 80px 60px rgb(var(--shadow-ink) / 0.015);
}
[data-theme="night"] {
  /* shadows barely read at night: lift by surface tone + rim instead, keep a stronger short shadow */
  --shadow-1: 0 1px 2px rgb(0 0 0 / 0.4);
  --shadow-2: 0 2px 6px rgb(0 0 0 / 0.45);
  --shadow-3: 0 8px 24px rgb(0 0 0 / 0.5);
  --shadow-4: 0 16px 48px rgb(0 0 0 / 0.55);
}
```

Never coloured glows; never hard offset shadows (v1's offsets are retired).

### 2.6 Borders and rims

- Hairline: `1px solid var(--line)`. Control border: `1px solid var(--line-strong)`.
- **Rim** (gradient border that catches light at the top and settles at the bottom). Use on: nav bar
  and plate, cards with `--shadow-1`+, buttons (secondary), mockup frames, the seal. Drawn in `::after`
  so `::before` stays free for grain:

```css
.rim { position: relative; }
.rim::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none;
  background: var(--rim, linear-gradient(180deg,
    rgb(255 255 255 / 0.9) 0%, rgb(255 255 255 / 0) 38%,
    rgb(var(--shadow-ink) / 0.06) 70%, rgb(var(--shadow-ink) / 0.14) 100%));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
/* plus a real border underneath so high-contrast / forced-colors modes still show an edge */
.rim { border: 1px solid transparent; }
@media (forced-colors: active) { .rim { border-color: CanvasText; } .rim::after { display: none; } }
```

| Rim variant | `--rim` value |
|---|---|
| default (light surfaces) | as above |
| on `--mk-panel` | `linear-gradient(180deg, rgb(255 255 255 / .28), rgb(255 255 255 / 0) 45%, rgb(255 255 255 / 0) 80%, rgb(255 255 255 / .10))` |
| night | `linear-gradient(180deg, rgb(255 255 255 / .10), rgb(255 255 255 / 0) 40%, rgb(255 255 255 / .02))` |
| accent button | `linear-gradient(180deg, rgb(255 255 255 / .28), rgb(255 255 255 / 0) 50%, rgb(0 0 0 / .18))` |

### 2.7 Texture: one shared grain + security print (marketing only)

Generators, sizes and the exact CSS are in `docs/design-research/notes/brand-assets.md` (tested).

- **Grain:** `public/brand/grain.png`, 160×160 tile, 8-bit grey noise around mid-grey, 14 KB. Applied as
  `::before` with `mix-blend-mode: overlay`. Opacity: `--grain-opacity: 0.32` on light surfaces, `0.5` on
  `--mk-panel` and `--mk-footer`. Used on: hero panel, CTA band, footer, pricing card. Not on text-only
  sections, not on DOM mockups, never in the app.
- **Guilloche rosette:** `public/brand/guilloche-rosette.svg` (3.6 KB gz) as `mask-image`, tinted by
  `background: var(--mk-line)` on the panel (≈1.4:1, decorative). One per hero, offset so ~40% of it bleeds
  off the panel edge. Also the seal ring (tinted with the verdict colour).
- **Guilloche wave:** `public/brand/guilloche-wave.svg` (4.0 KB gz), `repeat-x`, as a band divider in the
  CTA band and the footer top edge.
- **Microtext rule** (security-print divider, landing only): a 1-line strip of repeated mono text
  "EVERY LINE TRACES TO A FACT YOU CONFIRMED · " at 9px, `--mk-muted` or `--text-muted`, 60% opacity,
  `aria-hidden="true"`, `overflow: hidden; white-space: nowrap`. It duplicates a sentence that appears
  readable elsewhere on the page, so its size carries no information.
- Save-Data or `effectiveType` 2g/slow-2g: drop grain and guilloche (class on `<html>` set server-side from
  the `Save-Data` header). The design must look complete without them.

### 2.8 Motion

#### 2.8.1 Tokens

```css
:root {
  --dur-instant: 80ms;   /* press, toggle, check */
  --dur-fast: 150ms;     /* hover colour/shadow, tooltip, chevron */
  --dur-base: 200ms;     /* menu close, toast, proof mark, row expand */
  --dur-slow: 300ms;     /* dialog/sheet enter, page enter, step picture swap */
  --dur-slower: 500ms;   /* landing only: CTA sheen, hero seal press */
  --dur-spring: 320ms;   /* pairs with --ease-spring */
  --dur-press: 400ms;    /* pairs with --ease-press */

  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);   /* colour, shadow */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);      /* anything entering, all feedback */
  --ease-in: cubic-bezier(0.4, 0, 1, 1);           /* exits (exit ≈ 70% of enter duration) */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);   /* A→B moves on screen */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* sheets, drawers */
  /* damped springs sampled into linear() (ζ=0.78 ω=26, 2% overshoot; ζ=0.55 ω=30, 12.6% overshoot) */
  --ease-spring: linear(0, 0.103, 0.311, 0.528, 0.71, 0.844, 0.931, 0.983, 1.009, 1.019, 1.02, 1.017, 1.012, 1.008, 1.005, 1.002, 1);
  --ease-press: linear(0, 0.208, 0.589, 0.906, 1.079, 1.126, 1.101, 1.053, 1.012, 0.99, 0.984, 0.987, 0.993, 0.998, 1.001, 1.002, 1);
}
@supports not (transition-timing-function: linear(0, 1)) {
  :root { --ease-spring: var(--ease-out); --ease-press: var(--ease-out); }
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-instant: 0.01ms; --dur-fast: 0.01ms; --dur-base: 0.01ms; --dur-slow: 0.01ms;
          --dur-slower: 0.01ms; --dur-spring: 0.01ms; --dur-press: 0.01ms; }
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
                           transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

Motion (JS) equivalents, in `src/lib/motion.ts`:
`spring = { type: "spring", visualDuration: 0.3, bounce: 0.1 }` (menus, layout),
`press = { type: "spring", visualDuration: 0.35, bounce: 0.35 }` (seal, confirm check),
`sheet = { type: "spring", visualDuration: 0.32, bounce: 0 }` (drag release),
`fade = { duration: 0.2, ease: [0.23, 1, 0.32, 1] }`.

#### 2.8.2 What may animate

| Allowed | Where | Limits |
|---|---|---|
| `opacity`, `transform` | everywhere | — |
| `filter: blur()` | landing crossfades; app only on single small elements (toast, step picture) | ≤ 8px landing, ≤ 4px app; never on list items |
| `clip-path` | signature reveal, trace line | — |
| `background-size` | proof mark swipe | inline text only |
| `background-position` | landing CTA sheen | landing only |
| `color`, `background-color`, `border-color`, `box-shadow` | hover/focus feedback | `--dur-fast` |
| `grid-template-rows` 0fr↔1fr | disclosures (one at a time) | `--dur-base` |
| `height` | **only** the nav plate (one absolutely positioned element, ≥1024px) | `--dur-spring` |

Never: anything driven by scroll position, `IntersectionObserver` reveals, `transition: all`, animating
`width/top/left/margin/padding`, permanent `will-change`, infinite loops in the app, autoplay loops on the
landing, animating keyboard-initiated repeats (j/k, Enter-to-confirm still moves focus, but instantly).

#### 2.8.3 Motion catalogue

| Moment | What moves | Timing | Reduced motion |
|---|---|---|---|
| Button hover | bg colour + shadow step | 150ms standard | same (colour is not motion) |
| Button press | `translateY(1px) scale(.98)`, shadow down one step | 80ms out; release 150ms out | colour change only |
| Card hover (link cards) | shadow-1→2, `translateY(-1px)` | 150ms out | shadow only |
| Sibling dimming | other items → opacity .55 | 150ms standard | same |
| Nav plate open / close | plate height (spring), siblings dim, panel content fades in (delay 60ms) | open 320ms spring; close 180ms in | instant |
| Proof mark swipe | `background-size: 0% → 100%` from left | 200ms out | instant |
| Fact tag link | tag lifts (shadow-1→2, `translateY(-1px)`) + proof swipe on its source | 200ms out | instant |
| Verdict seal press (first render of a new verdict only) | `scale(1.08)→1`, opacity 0→1, `rotate(-6deg → -4deg)` | 400ms `--ease-press` | appears |
| Blue signature reveal | `clip-path: inset(0 100% 0 0) → inset(0)` | 300ms out, once per confirm | appears |
| Confirm queue: card leaves / next enters | leaving: `x 0→-24px`, opacity→0; entering: `x 24px→0`, opacity 0→1 | leave 180ms `--ease-in`, enter 250ms `--ease-out` | swap instantly; focus moves |
| Disclosure (requirement row, FAQ) | grid rows 0fr→1fr, chevron 0→180° | 200ms out | instant |
| Tabs / segmented | active indicator moves (`transform: translateX`) | 200ms in-out | instant |
| Page enter (app routes) | `opacity 0→1`, `translateY(4px)→0` on `main` | 200ms out, CSS keyframes in `template.tsx` | none |
| Dialog | opacity + `scale(.98)→1` | enter 300ms out, exit 200ms in | fade only |
| Sheet / drawer | `translateY(100%)→0` (phone) / `translateX(100%)→0` (desktop) | 300ms drawer, exit 200ms in | fade only |
| Toast | `y 8px→0` + opacity; exit opacity + `y→4px` | 200ms / 150ms | fade |
| Landing step picture swap | out: opacity→0 + blur 6px + `y -8px`; in: reverse, 80ms stagger | 300ms out | instant |
| Landing CTA sheen | gradient `background-position 50% 0 → 50% 70%` + shadow-2→3 | 500ms out | none |
| Skeleton | optional opacity pulse 1→.6 | 1.6s in-out, max 3 cycles, then static | static |

### 2.9 Z-index

`--z-base: 0; --z-raised: 10` (sticky in-page headers, stretched-link buttons) · `--z-tabbar: 40` ·
`--z-header: 50` · `--z-plate: 55` (nav plate, dropdowns) · `--z-scrim: 70` · `--z-sheet: 80` (dialogs,
drawers) · `--z-toast: 90` · `--z-skip: 100` (skip link). Native `<dialog>` uses the top layer; keep the
tokens for non-dialog layers.

### 2.10 Breakpoints and layout

Media queries can't read custom properties; use these literal values everywhere.

| Name | Range | Shell |
|---|---|---|
| phone | < 600px (design at 360) | compact top bar + bottom tab bar; single column; bottom action bar on task screens |
| tablet | 600-1023px | compact top bar + bottom tab bar; single column, wider gutters; drawers from the right |
| desktop | ≥ 1024px | top nav with morphing plate; multi-column layouts |
| wide | ≥ 1280px | same, more whitespace; landing feature cards at `--w-wide` |

```css
:root {
  --w-prose: 68ch;
  --w-narrow: 640px;    /* upload, confirm, settings */
  --w-feed: 760px;      /* jobs feed column */
  --w-content: 1080px;  /* landing sections */
  --w-app: 1200px;      /* app shell, editor, job check */
  --w-wide: 1240px;     /* landing feature cards */
  --gutter: 16px;       /* 24px ≥600, 32px ≥1024 */
  --nav-h: 56px;        /* desktop bar (inside a 72px header strip) */
  --topbar-h: 52px;     /* phone/tablet compact bar */
  --tabbar-h: 56px;     /* + env(safe-area-inset-bottom) */
}
html { scroll-padding-top: 88px; scroll-padding-bottom: calc(var(--tabbar-h) + 16px); }
```

---

## 3. Components

### 3.0 Rules for every component

- **States:** default, hover (only under `@media (hover: hover)`), press/active, focus-visible, disabled
  (with a visible reason), loading, error, empty, long content, Devanagari content, night theme.
- **Focus ring:** `outline: 2px solid var(--focus); outline-offset: 2px;` on `:focus-visible`, using the
  element's own radius. Never removed; never hidden by sticky bars (scroll-padding above).
- **Targets:** 44×44px minimum on touch. Visually smaller controls (chips 36px, icon buttons 36px on
  desktop) extend their hit area with `::before { inset: -4px }` or padding.
- **Disabled:** opacity .45, no shadow, `aria-disabled="true"` (prefer over `disabled` so it stays
  focusable and can announce its reason via `aria-describedby`). No cursor change.
- **Loading:** keep the label, add a 16px spinner (2px ring, `--dur` 700ms linear rotate; under reduced
  motion a static three-dot glyph), `aria-busy="true"`. Lock width by stacking label and spinner in one
  grid cell (`display: inline-grid; > * { grid-area: 1/1 }`), never with a fixed width. Show spinners
  after 150ms and keep them ≥400ms.
- Hover is never the only way to see something: everything hover reveals also shows on focus and tap.

### 3.1 App shell

#### Desktop top nav (≥1024)

```
 header strip: sticky, top 0, height 72, background var(--bg), z header
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │  ╭──────────────────────────────────────────────────────────────────────────────────╮  │
 │  │ Hunt   Jobs ▾   Resume   Profile                  [● 4 facts to confirm]   (RI) ▾ │  │ bar 56, max 1200,
 │  ╰──────────────────────────────────────────────────────────────────────────────────╯  │ r-lg, surface, rim,
 └────────────────────────────────────────────────────────────────────────────────────────┘ shadow-1
```

- Wordmark "Hunt": `--ff-display` 500, 22px, tracking -0.02em, links to `/jobs` when signed in.
- Items: `--t-label` at 15px, `--text-muted`; height 40, padding 0 12px, `--r-md`. Hover: `--text` and
  `--bg-sunken` fill. Active (`aria-current="page"`): `--text`, plus a 2px `--accent` bar 16px wide
  centred under the label (static, no slide).
- "Jobs" is a link to `/jobs` **plus** an adjacent 28×40 disclosure button (chevron, `aria-expanded`,
  `aria-controls="nav-panel-jobs"`, label "Jobs sections"). Avatar is a disclosure button
  (`aria-controls="nav-panel-account"`). Disclosure pattern, not `role="menu"`.
- Queue badge (only when > 0): `--accent-tint` fill, `--accent` text, 6px accent dot, `--t-xs`, r-full,
  links to `/onboarding?step=confirm`.

**The morphing plate.** One absolutely positioned `.plate` behind the bar's contents carries the
background, rim and `--shadow-3`. Closed, its height equals the bar (56). Opening a panel sets
`--plate-h` to bar + measured panel height, and the plate grows down **in place**: one continuous surface,
not a popover.

```
 ╭──────────────────────────────────────────────────────────────────────────────────╮
 │ Hunt   Jobs ▴   Resume   Profile          (dimmed to .55)          (RI) ▾        │
 │ ┌──────────────────────────────┐ ┌──────────────────────────────┐                 │
 │ │ For you                      │ │ Saved & pasted               │  Paste a job →  │
 │ │ Real jobs ranked to the      │ │ Jobs you saved or pasted     │  Feed settings →│
 │ │ skills you confirmed         │ │ yourself, with their checks  │                 │
 │ └──────────────────────────────┘ └──────────────────────────────┘                 │
 ╰──────────────────────────────────────────────────────────────────────────────────╯  plate height 56→~176
```

Account panel (right-aligned contents in the same plate): name + email (`--t-sm` muted) · Settings ·
Theme (Light / Night / System, inline segmented) · Language (English / हिन्दी) · Help · Sign out (form POST).

- Open: click/Enter/Space on the disclosure button; on `(hover: hover)` devices also hover the trigger
  for 120ms (intent delay). Close: Esc (focus returns to trigger), click outside, pointer leaving the
  header for 200ms, or navigating. Switching from Jobs to Account while open: the plate re-targets its
  height (the CSS transition retargets mid-flight) and contents crossfade 150ms.
- Motion: `transition: height var(--dur-spring) var(--ease-spring)` on open, `180ms var(--ease-in)` on
  close (swap the transition via `[data-open]`). Panel content `opacity 0→1`, 150ms, 60ms delay on open,
  no delay on close. Sibling items dim to opacity .55 (`.bar[data-open] .item:not([aria-expanded="true"])`).
- Panel tiles: `--r-md`, padding 16, title `--t-label` `--text`, description `--t-sm` `--text-muted`;
  hover `--bg-sunken`; focus ring. Sibling dimming inside the panel on hover (`:has`).
- Glass: `color-mix(in srgb, var(--surface) 78%, transparent)` + `blur(10px) saturate(1.1)`, `--shadow-3`; the header strip behind it is transparent. Solid `--surface` while open, and as the fallback.

#### Phone / tablet (<1024)

```
 ┌──────────────────────────────────┐
 │ Hunt          [● 4 to confirm] (RI)│  compact top bar 52, bg var(--bg), NOT sticky (scrolls away)
 ├──────────────────────────────────┤
 │                                  │
 │            page content          │
 │                                  │
 ├──────────────────────────────────┤
 │   ▭ Jobs     ▤ Resume    ◯ Profile│  tab bar 56 + safe area, fixed bottom, surface, hairline top
 └──────────────────────────────────┘
```

- Tab bar: 3 equal tabs, icon 24 (1.75px stroke, authored SVG) above `--t-tab` label. Inactive
  `--text-muted`; active `--accent` icon + label, plus a 2px × 24px accent bar on the top edge of the tab.
  `aria-current="page"`. Whole tab is the target (≥ 56×56). No animation on tab change beyond page enter.
- Avatar (RI) opens the account panel as a **bottom sheet** (3.15).
- On task screens (confirm queue, editor on phone, upload) the tab bar is replaced by the **bottom action
  bar**: surface, hairline top, `--shadow-3`, padding 12 16 + safe area, holds 1 primary + ≤ 1 secondary
  button, full width split. Pages under bottom bars get `padding-bottom` equal to the bar height.
- Jobs sub-sections on phone are in-page tabs (For you / Saved & pasted) at the top of `/jobs`.

#### Page header (app)

Title `--t-d2` display, optional one-line description `--t-body` muted, actions right-aligned on desktop
(stacked under on phone). No eyebrow. Margin-bottom 24 (phone) / 32.

#### Page enter

`src/app/(app)/template.tsx` wraps `main` content in a div with a CSS keyframe
`page-in { from { opacity: 0; transform: translateY(4px) } }` 200ms `--ease-out`. Shell (nav, tab bar)
never animates. View Transitions are not used (experimental in Next 16; revisit later).

### 3.2 Landing nav

Floating bar: `position: fixed; top: 16px` (12 on phone), width `calc(100% - 32px)` max 880, height 56,
`--r-lg`, rim, `--shadow-3`. **Glass (landing only):**
`background: linear-gradient(180deg, rgb(254 253 251 / .70), rgb(254 253 251 / .86)); backdrop-filter: blur(10px) saturate(1.1);`
fallback `@supports not (backdrop-filter: blur(1px))` and `.save-data` → `background: var(--surface)`.
Fixed position never changes with scroll (no docking, no shrink, no hide).

- Desktop contents: wordmark · "Product ▾" (disclosure) · How it works · For whom · Pricing · FAQ ·
  "Sign in" (text) · primary button "Build my resume". Section links are `#anchors`; smooth scroll only
  under `prefers-reduced-motion: no-preference`.
- "Product" opens the same morphing plate as the app (3.1): two live mini tiles ("Build a resume you can
  prove" with a 3-line DOM resume snippet; "Hunt jobs honestly" with a tiny seal and one Proven row) and
  two compact rows (How it works, Pricing promise). Blur on the plate rises 10→14px while open.
- Phone: wordmark · "Build my resume" (small primary) · menu button (44×44, "Menu", `aria-expanded`). The
  menu **is the bar growing**: the plate expands to `min(100dvh - 24px, content)` height and lists the links
  at `--t-d2` display size, then Sign in + primary CTA at the bottom. Focus is kept inside while open
  (inert on `main`), Esc and the button close it, `overscroll-behavior: contain`, body scroll locked.

### 3.3 Buttons

| Variant | Rest | Hover | Press | Notes |
|---|---|---|---|---|
| **Primary** | `--accent` fill, `--on-accent` text, accent rim, `--shadow-1`, `inset 0 1px 0 rgb(255 255 255/.16)` | `--accent-hover`, `--shadow-2` | `translateY(1px) scale(.98)`, `--shadow-0` | One per view. Label names the outcome ("Confirm 8 facts", "Download PDF"). |
| **Secondary** | `--surface`, `--text`, default rim + `1px --line-strong` border, `--shadow-1` | `--bg-sunken` fill | as primary | Most actions. |
| **Ghost** | transparent, `--text` | `--bg-sunken` | `--line` fill | Toolbars, "Not mine", tertiary. |
| **Danger** | `--surface`, `--danger` text and border | `--conflict-bg` | as primary | Destructive confirm in dialogs uses danger **filled** (`--danger` bg, `--surface` text). |
| **On-panel** (landing) | `--mk-text` fill, `--mk-panel` text, `--shadow-3` | sheen + `--shadow-4` | as primary | Hero/CTA band only. Sheen: inner gradient `linear-gradient(180deg, #fff9, #fff6 25%, #fff9 50%, #ffffffd6 75%)` at `background-size: 300% 300%`, position 50% 0 → 50% 70% over 500ms. |
| **Icon** | ghost or secondary, square | as variant | as variant | 44×44 (36 visual on desktop with extended hit area); always `aria-label`; tooltip on hover/focus. |
| **Text link** | `--text`, 1.5px accent underline at 0.2em offset | `--accent` | — | Inline links. Landing footer links: underline grows 0→100% width from left, 300ms. |

Sizes: **default** height 44, padding 0 18, `--t-label` 15px, `--r-md`, icon 18 with gap 8.
**Small** height 36 (hit area 44), padding 0 12, 14px, `--r-sm`. **Large** (landing) height 52, padding
0 24, 16px. Transitions list properties explicitly:
`transition: background-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard), transform var(--dur-instant) var(--ease-out);`
Focus, disabled, loading: per 3.0.

### 3.4 Inputs

- Text input / select (native) / textarea: height 48 (phone) / 44 (desktop), padding 0 14, `--t-body`
  16px always, `--surface`, `1px solid var(--line-strong)`, `--r-md`. Textarea min 3 rows,
  `field-sizing: content` where supported (fallback: fixed rows + resize: vertical), max 12 rows.
- Label above, always visible (`--t-label`, `--text`), margin-bottom 6. Optional helper below
  (`--t-sm` muted). No floating labels, no placeholder-as-label.
- Hover: border `--text-muted`. Focus: border `--accent` + the 2px focus ring. Error: border `--danger`,
  message below with the alert icon in `--danger`, `aria-invalid="true"` + `aria-describedby`; on submit,
  focus the first invalid field. Disabled: `--bg-sunken` fill, `--text-muted` text. Read-only: no border,
  `--bg-sunken`.
- Correct `type`, `inputmode`, `autocomplete`; never block paste. Phone: fixed "+91" prefix segment,
  `inputmode="tel"`. Salary: "₹" prefix, "LPA" suffix, stored as a number.
- Checkbox / radio: 20px box, 44px row hit area, `accent-color: var(--accent)` on native inputs (styled
  natively; no custom replacement). Switch: 44×26 track, r-full, thumb moves with `transform`, 150ms.
- **Segmented control** (responsibility level, theme, Edit/Preview): container `--bg-sunken`, `--r-md`,
  padding 3; items `--t-label`, height 38, `--r-sm`; selected item `--surface` + `--shadow-1` + rim, the
  selected pill slides with `translateX` 200ms in-out. Built as a radio group (arrow keys move).

### 3.5 Chips and filters

- **Filter chip:** height 36 (hit 44), padding 0 14, r-full, `--surface`, `1px --line-strong`, `--t-label`.
  With a value: "Location: Bengaluru" + chevron. Selected/applied: `--accent-tint` fill, `--accent` border
  and text, leading 14px check icon. Hover `--bg-sunken`. Press `scale(.97)` 80ms.
- **"All filters" chip:** same, with a count badge (`--accent` fill, `--on-accent`, 18px circle, `--t-xs`).
  Opens the filter drawer (3.15).
- **Chip row:** horizontal, `overflow-x: auto`, `scroll-snap-type: x proximity`, no scrollbar on touch,
  16px gutter padding so first/last chip align with content. On desktop it wraps instead.
- **Skill chip (read-only):** height 28, padding 0 10, `--r-sm`, `--bg-sunken`, `--t-sm`. Confirmed skills
  get a 6px accent dot.
- Filters live in the URL (`?loc=bengaluru&mode=remote&exp=0-2&posted=7d`). Desktop chips apply live;
  the phone drawer applies on "Show N jobs".

### 3.6 Status marks (replace v1 "stamps")

Inline: height 24, padding 0 8, `--r-xs`, `--t-xs`, icon 12 (from `StatusIcon`) + word. Styles per 2.1.2
(tint fill / dashed outline / solid border). Screen-reader text spells the full status
("Status: no confirmed fact yet"). Never alone: always next to the thing it judges. No rotation, no
uppercase stamp lettering (retired with Archivo).

### 3.7 Proof mark, fact tag, blue signature line

**Proof mark** (`.proof`):

```css
.proof {
  color: var(--on-proof);
  background: linear-gradient(var(--proof), var(--proof)) no-repeat 0 62% / 100% 80%;
  padding: 0 0.14em; margin: 0 -0.14em;
  border-radius: 3px 6px 4px 7px / 6px 3px 7px 4px;   /* marker-chisel ends, not a box */
  -webkit-box-decoration-break: clone; box-decoration-break: clone;
  transition: background-size var(--dur-base) var(--ease-out);
}
.proof[data-state="off"] { background-size: 0% 80%; }       /* linkable proof waits for focus/hover */
@media (forced-colors: active) { .proof { forced-color-adjust: none; background: Mark; color: MarkText; } }
```

Static proof (posting quotes, source lines) is always on. **Linked proof** (landing mockup, editor) sits
at `data-state="off"` and swipes on when its claim is hovered, focused or tapped. Night: unchanged (dark
ink on yellow).

**Fact tag** (`.tag`), pure CSS, no asset:

```
  ◁○ F-15 · 12 Oct ▕     height 24, manila, pointed left end with a punched hole
```

```css
.tag {
  display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px 0 16px;
  background: var(--tag); color: var(--on-tag);
  font: 500 0.8125rem/1 var(--ff-mono); letter-spacing: 0.02em; font-variant-numeric: tabular-nums;
  clip-path: polygon(8px 0, 100% 0, 100% 100%, 8px 100%, 0 50%);
  border-radius: 0 var(--r-xs) var(--r-xs) 0;
  -webkit-mask: radial-gradient(circle 2.5px at 9px 50%, #0000 96%, #000 100%);
          mask: radial-gradient(circle 2.5px at 9px 50%, #0000 96%, #000 100%);
}
```

Shows the short ID; the full ID and fact text are in a tooltip (hover/focus) and the tag is a button that
opens the fact (drawer on phone, popover on desktop). States: hover `translateY(-1px)` + a `drop-shadow`
of `--shadow-1` values on a wrapper (clip-path clips box-shadow); linked/active: 1px accent outline on the
wrapper; changed fact: tag gets a 6px `--partial` dot and the tooltip says "Fact updated after this line
was written". Copy on long-press is not needed.

**Blue signature line:** "Confirmed by you · 12 Oct 2026" in `--font-display-italic`, 15px, `--accent`, with
a 14px check. Revealed once with the clip-path sweep (2.8.3) at the moment of confirming; static thereafter.

### 3.8 Cards

**Base card:** `--surface`, `--r-lg`, rim, `--shadow-1`, padding 16 / 20 (desktop 24). Link cards use
the stretched-link pattern: the title's `<a>` gets `::after { inset: 0 }`; other buttons inside sit at
`--z-raised`. Hover: `--shadow-2`, `translateY(-1px)`. Press: `translateY(0) scale(.995)`.
Sets of cards (persona cards, template picker, landing tiles) use sibling dimming on hover-capable
devices: `.set:has(> :hover) > :not(:hover) { opacity: .55 }`.

**Job card** (Saved & pasted; the feed it was drawn for was removed 2026-11-21: early-read, Save and Report no longer apply). Phone ~132-156px tall; desktop one row group in a 760 column.

```
 ┌────────────────────────────────────────────────────────────────────┐
 │ Frontend Engineer II                                     [♡ Save]  │  title --t-title, 2 lines max
 │ Lumen Health · Bengaluru · Hybrid                                  │  --t-sm --text
 │ 1-3 yrs · ₹8-12 LPA · 3 days ago · via company site               │  --t-sm muted, tabular-nums
 │ ◐ Uses React and TypeScript, which you confirmed. GraphQL isn't    │  reason line (1 sentence),
 │   in your facts yet.                                               │  early-read icon, --t-sm --text
 │ ─────────────────────────────────────────────────────────────────  │
 │ [ Check this job ]                         Not for me · Report     │  secondary btn · ghost text btns
 └────────────────────────────────────────────────────────────────────┘
```

- Fields, in order: title · company · place · mode (Remote / Hybrid / On-site) · experience range
  ("1-3 yrs", "Fresher") · salary ("₹8-12 LPA") **or "Salary not shown"** (muted, never hidden) · age
  ("Today", "3 days ago", "3 weeks ago") · source ("via company site", "via Greenhouse") · **one reason
  line**. Missing values are omitted with their separator, except salary which always shows.
- Early read (`PreliminaryFit`): icon + the reason sentence; never a word like "match %". strong → check
  icon `--supported`; some → half icon `--partial`; little → dash icon `--missing`. Once a full check
  exists, the reason line is replaced by a status mark of the verdict ("Good fit with gaps · 1 gap") and the
  button becomes "Open check".
- Save: icon toggle (heart outline → filled `--accent`), `aria-pressed`, label "Save job". Optimistic,
  with an undo toast on unsave.
- Report: ghost text button → dialog with reasons (Fake / Asks for money / Expired / Wrong details).
- Card body (outside buttons) is a link to the job page.
- Loading: skeleton matches exactly (3.17). Long titles: clamp 2 lines, full title in `title` attr and on
  the job page. Devanagari company names: line-height 1.6 already covers it.

### 3.9 Verdict seal

One per page (job check). Sizes: 120px (desktop), 96px (phone), 64px (landing mockups only). Never on job cards or lists.

```
          ⟋ guilloche ring tinted --{verdict} ⟍
        (    ┌───────────────────┐    )
       (     │   Good fit        │     )      inner disc: --surface, rim
        (    │   with gaps       │    )       verdict: --ff-display 500, 17px (120px seal) / 15px (96px)
          ⟍  │   CHECKED 6 NOV   │  ⟋         date: --ff-mono 10px, --text-muted, aria-hidden (date is
             └───────────────────┘              also in the header in readable size)
```

- Built as: outer `div` r-full with `background: var(--seal-color)` masked by the rosette SVG
  (2.7), inner disc inset 14% with `--surface`, rim, `--shadow-2`. Whole seal rotated −4°. Accessible
  name: `role="img" aria-label="Verdict: Good fit with gaps"`.
- Beside it (desktop) / below it (phone): the 2-3 plain reasons and the one main action.
- Motion: press-in only the first time a new verdict renders (2.8.3). While the check is running: the
  ring is `--line` and the disc says "Checking…" with the static three-dot glyph; no spinning ring.
- Error: no seal; an error state card (3.18) takes its place.

### 3.10 Requirement rows (job check)

Grouped **Proven / Partly / Missing**, each group a section with a header and count, rows collapsed.

```
 Proven · 6                                                            (group header --t-h + mark)
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ ✓ React and TypeScript in production                    Required        ⌄   │  row 52 min height
 ├──────────────────────────────────────────────────────────────────────────────┤
 │ ✓ Design systems / component libraries                  Required        ⌃   │  expanded:
 │   From the posting                                                          │  --t-xs muted label
 │   ▌"You have built or maintained a shared component library"▐               │  mono quote, proof mark
 │   Your fact  ◁○ F-14   Built and maintained the shared React component …   │  tag + fact text
 └──────────────────────────────────────────────────────────────────────────────┘
 Missing · 3
 │ – GraphQL                                                Required        ⌃   │
 │   From the posting  ▌"Experience consuming GraphQL APIs (Apollo or urql)"▐  │
 │   No confirmed fact yet.  [ I have this: add a fact ]                       │  opens "Close the gap" drawer
```

- Row = `<button aria-expanded>` header + region. Header: status icon, requirement text (`--t-body`),
  importance ("Required" / "Nice to have", `--t-sm` muted), chevron. Rows separated by hairlines inside one
  card per group (not a card per row).
- Expanded: "From the posting" + quote in `--t-quote` with the proof mark; then "Your fact" with tag and
  fact text, or for Partly the note ("You contributed to LCP work; ownership isn't recorded."), or for
  Missing "No confirmed fact yet." + "I have this: add a fact" (secondary small).
- Group order: Missing first if the user arrived from "biggest gaps", else Proven → Partly → Missing.
  Groups themselves are always open; rows closed. "Expand all" ghost button per page.
- Expand: grid-rows 200ms; chevron rotates. Only one row animates at a time (others snap).
- Long quotes: wrap, max 72ch. A quote is always from stored posting text, never model output.

### 3.11 Fact card (confirm queue)

```
 ┌──────────────────────────────────────────────────────────────┐
 │ Roles · 3 of 8                                     Skip for now │  section + position, --t-sm
 │ Frontend Engineer · Kestrel Pay · 2021-2024                  │  --t-title
 │                                                              │
 │ Cut checkout page load from 4.1s to 2.3s by splitting the    │  fact text --t-lead (editable)
 │ JavaScript bundle.                                           │
 │                                                              │
 │ From your resume                                             │  --t-xs muted
 │ ▌"Worked on LCP: bundle split, checkout 4.1s → 2.3s"▐        │  mono + proof mark
 │                                                              │
 │ ⚠ Check these numbers: [4.1s] [2.3s]                        │  only when the fact has numbers
 │                                                              │
 │ Your part   ( Contributed | [Owned] | Led | Managed )        │  segmented, pre-selected
 │                                                              │
 │ [ Not mine ]   [ Edit ]                    [ Confirm ]       │  ghost · secondary · primary
 └──────────────────────────────────────────────────────────────┘
```

- One card at a time on every size; desktop shows the remaining facts as a compact list beside it (4.3).
- Numbers callout: `--partial-bg` strip with `--partial` icon, numbers as mono chips; tapping a chip
  focuses that number in the edit field.
- Confirm: the blue signature line sweeps in under the text (300ms), a small check presses in
  (`press` spring), then the card leaves left and the next enters (2.8.3). Focus moves to the next card's
  heading (`tabIndex=-1`). Undo toast (6s) restores it.
- Not mine: card leaves the same way with an undo toast; the fact is marked rejected, never deleted
  silently.
- Edit: fact text becomes a textarea in place; actions become Cancel / Save and confirm.
- **Confirm all:** a bar above the card: "8 facts left in Roles. [Confirm all 5 without numbers]" (the 3
  with numbers stay for one-by-one review). Opens a small confirm dialog listing them; on confirm, all
  get the signature line at once (no per-card animation).
- Keyboard: Enter on the focused card confirms (no animation for keyboard repeats beyond the focus
  move), E edits, N = not mine. Shortcuts listed in a "Keyboard" disclosure, desktop only.
- Empty (all confirmed): success state with the seal-less "All facts confirmed" title + two exits
  ("Create my resume" primary, "See jobs" secondary).

### 3.12 Upload dropzone

```
 ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
   (doc icon 40)
   Drop your resume here                                         dashed 1.5px --line-strong, r-xl,
   PDF, Word or text, up to 10 pages                             --surface, padding 32, min-height 220
   [ Choose file ]                                               primary, 48 tall (the main path on Android)
 └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
   No resume? Start from a few questions →                       text link, below the zone
```

| State | Look | Copy |
|---|---|---|
| Idle | as above | — |
| Drag over (desktop) | border solid `--accent`, fill `--accent-tint`, icon `translateY(-2px)` | "Drop to upload" |
| Uploading | file row (icon, name, size) + 4px determinate bar (`--accent` on `--line`, `transform: scaleX`) | "Uploading… 1.2 of 2.0 MB" |
| Reading | named stage list replaces the bar, styled as a chain of thought (owner call, 2026-11-21): a 1.5px `--line` connector joins the markers; pending (hollow circle, muted), current (spinner ring with `--accent` top, label shimmers `--text-muted`→`--text`, 1.8s; both static under reduced motion), done (check, `--supported`, connector tinted) | "Reading your file" → "Finding your roles" → "Finding dates and numbers" → "Getting facts ready"; header "Step 2 of 4" |
| Slow (> 10s) | add a muted line | "This can take up to a minute. You can leave this page; we'll keep going and show a badge when it's ready." |
| Done | stage list all checked, then auto-route to Confirm after 600ms (instant under reduced motion) | "Found 31 facts to confirm" |
| Error | zone border `--danger`, alert icon, file row kept, actions | Wrong type: "This file isn't a PDF, Word or text file." · Too long: "We read up to 10 pages. Upload a shorter version." · Network: "Upload stopped. Your file is still selected." + [Try again] [Choose another file] |

- `<input type="file" accept=".pdf,.docx,.txt">` is the real control (visually styled label); the zone is
  a progressive enhancement for drag (WCAG 2.5.7: dragging is never required).
- Under the zone, always: "Free PDF and Word export. Your file is read in a sealed sandbox and never
  shared." (`--t-sm` muted, lock icon).

### 3.13 Resume preview frame

- Stage: `--bg-sunken`, `--r-xl`, padding 24 (desktop) / 12 (phone). Sheet: `--paper-white`, A4 ratio
  (`aspect-ratio: 1 / 1.4142`), `--shadow-object`, `--r-xs`, scaled to fit the stage width with
  `transform: scale(var(--fit))` computed from a ResizeObserver (not `zoom`). Page breaks: a 12px gap
  between sheets with a `--t-xs` muted "Page 2" label.
- The sheet content is the real template render (Typst output as SVG/PNG pages or the HTML preview); it is
  never styled by this system (see 5).
- Updating: previous render stays visible at opacity .6 with a small inverse chip "Updating preview"
  top-right (appears after 300ms). Error: render stays, chip turns into "Preview didn't update. Your edits
  are saved. [Retry]". Empty: an outline sheet with "Your confirmed facts will appear here."
- Linked hover: hovering/focusing a statement in the editor outlines its line in the preview with a 2px
  accent ring (if the renderer exposes line boxes; otherwise skip).
- Template picker: 6 thumbnails (static AVIF, 160px wide, lazy) in a grid; selected = 2px accent outline +
  check; the recommended one first with its reason ("Campus: for freshers"). Sibling dimming on hover.

### 3.14 Toasts

`--inverse-bg` / `--inverse-text`, `--r-lg`, `--shadow-3`, padding 12 16, max-width 420, `--t-sm`. Optional
one action as an inline text button in `--toast-action` (`#96B6FE` in light, where the toast is dark;
`#2B4BAC` in night, where the toast is light; 8.2:1 and 6.7:1). Position: bottom centre above the tab/action bar on phone;
bottom-right 24px on desktop. One visible at a time, others queue. Duration 6s (10s if it has Undo),
paused on hover/focus. `role="status"` in a persistent `aria-live="polite"` region; errors that block
work are not toasts (inline instead).

### 3.15 Dialogs and drawers

- **Dialog:** native `<dialog>` + `showModal()` (focus trap, Esc, top layer for free). `--surface`,
  `--r-xl`, `--shadow-4`, max-width 480 (wide variant 640), padding 24. Title `--t-d3`. Actions bottom-right
  (desktop) / full-width stacked (phone, primary on top). `::backdrop { background: var(--scrim) }`.
  Enter/exit with CSS: `transition: opacity, transform, overlay allow-discrete, display allow-discrete`
  + `@starting-style` (no animation where unsupported). Return focus to the trigger on close.
- **Drawer (desktop/tablet):** `<dialog>` styled as a right panel, width 420, full height, `--r-xl` on
  the left corners. Used for filters, "Close the gap", feed settings (alerts, what feedback changed,
  where jobs come from), fact detail.
- **Bottom sheet (phone):** same `<dialog>`, docked bottom, `--r-xl` top corners, max-height 85dvh, inner
  scroll with `overscroll-behavior: contain`, 36×4 grabber (visual only), close button always present
  (drag-to-dismiss optional: if built, Motion `drag="y"` with `sheet` spring; never the only way).
- No `backdrop-filter`. Scrim fades 200ms.

### 3.16 Tabs, disclosure, menus

- **Tabs** (Jobs: For you / Saved & pasted; Resume: Edit / Preview on phone): `role="tablist"`, items
  `--t-label`, height 44, underline indicator 2px `--accent` that slides (`translateX` + `scaleX`, 200ms).
  Tabs that change the URL are links styled as tabs (`aria-current`), not ARIA tabs.
- **Disclosure / FAQ:** `<details>`/`<summary>` where possible; animated with grid-rows on a wrapper;
  chevron 20.
- **Overflow menu** (resume "Share", "Duplicate", "Delete"): disclosure button + list of buttons in a
  popover (`popover` attribute + anchor positioning where supported, fallback absolute), `--surface-raised`,
  `--r-md`, `--shadow-3`, items 44 tall.

### 3.17 Skeletons

- Same box sizes as the final layout (zero CLS), `--bg-sunken` blocks, `--r-xs` for text lines (height =
  line-height × 0.6, last line 60% width), real borders/rims on the container so the shape is right.
- Shown only if loading exceeds 300ms; once shown, at least 400ms. Feed: 4 job-card skeletons. Job check:
  seal circle + 3 lines + 3 group headers. Profile: section headers + 3 rows each.
- Optional pulse per 2.8.3, off under reduced motion and Save-Data. `aria-busy="true"` on the region and
  one sr-only "Loading jobs" message.

### 3.18 Empty and error states

Layout (centred in its container, max 420): 40px line icon (authored SVG, `--text-muted`, 1.75px
stroke) · title `--t-d3` display · one sentence `--t-body` muted · one primary action naming the outcome ·
optional secondary link. No illustrations, no hand-drawn art (retired).

| Where | Title | Sentence | Action |
|---|---|---|---|
| Find jobs, no profile yet | Start with your resume | Your job searches are built from it. It takes about five minutes. | Upload my resume |
| Improve, nothing left | Nothing to fix | Your confirmed facts pass every check we run. | Pick a template · Find jobs |
| Saved & pasted, empty | Nothing saved yet | Found a job on LinkedIn, Naukri or a company site? Paste it here. | Paste a job |
| Resume list, empty | No resume yet | Your master resume is written from your confirmed facts. | Create my resume |
| Job check failed | We couldn't finish this check | Nothing was charged against your checks. | Try again |
| Offline | You're offline | Your edits are saved on this phone and will sync when you're back. | Retry |
| Not found | This page isn't here | It may have moved or been deleted. | Go to Jobs |

Errors always say what happened, what is safe, and what to do. Never a dead end.

---

## 4. Screens

Wireframes are structure, not pixel art. Widths: desktop at 1280-1440, phone at 360. `[ ]` = button,
`( )` = chip/segmented, `▌…▐` = proof mark, `◁○` = fact tag, `(seal)` = verdict seal.

### 4.1 Landing (`/`), always light theme

Section order: Nav · Hero · Two things Hunt does · How it works · The proof standard · Who it's for ·
Pricing promise · FAQ · Closing band · Footer. Page background `--bg`, main wrapper padding 16 (20 ≥1024),
120px between blocks (72 phone). Every section is fully rendered on arrival; nothing waits for scroll.

**Desktop**

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐ --bg
│ ╭──────────────────────────────────────────────────────────────────────────────────────────╮ │
│ │        ╭───────────────────────────────────────────────────────────────────────╮        │ │ HERO: inset panel
│ │        │ Hunt  Product▾  How it works  For whom  Pricing  FAQ   Sign in [Build…]│        │ │ --mk-panel + grain
│ │        ╰───────────────────────────────────────────────────────────────────────╯        │ │ r-2xl, min-h
│ │                                                                         .·:::::·.       │ │ min(100dvh-32,
│ │  A resume where                          ┌ resume sheet (live DOM) ──────────────┐ ::  │ │ 860), rosette
│ │  every line has ▌proof.▐                 │ Rohan Iyer                             │  :: │ │ bleeding off the
│ │   (serif 80, "proof." italic)            │ Frontend Engineer · Bengaluru          │ ::  │ │ top-right
│ │                                          │ ────────────────────────────────────── │     │ │
│ │  Upload the resume you have. Confirm     │ Kestrel Pay · 2021-2024                │     │ │
│ │  what's really yours. Hunt writes an     │ • Built the shared React component …   │     │ │
│ │  ATS-safe resume from those facts        │ • Cut checkout load from 4.1s to 2.3s ─┼──╮  │ │ trace line
│ │  alone, then finds real jobs and tells   │ • Wrote Jest tests for payments flows  │  │  │ │
│ │  you honestly how you fit.               └────────────────────────────────────────┘  │  │ │
│ │                                                  ╭ ◁○ F-15 · Confirmed by you 12 Oct ╮  │ │ manila tag card
│ │  [ Build my resume, free ]  See a job check →    │ ▌"LCP work: bundle split, 4.1s →  │  │ │
│ │                                                  │  2.3s"▐ from your old resume       │  │ │
│ │  Free PDF + Word export · No card · Made in India╰───────────────────────────────────╯  │ │
│ │                                      ┌ job check (live DOM) ───────────────────────┐    │ │
│ │                                      │ Frontend Engineer II · Lumen Health  (seal) │    │ │ overlaps sheet's
│ │                                      │ Proven 3  ·  Partly 1  ·  Missing 1          │    │ │ lower-left, cut by
│ │                                      │ Checked today, Fri 6 Nov                     │    │ │ the panel edge
│ ╰──────────────────────────────────────┴──────────────────────────────────────────────┴────╯ │ (fade to panel)
│                                                                                              │
│   Two things Hunt does                                     (H2 --t-d1, left-aligned, 1080)   │
│   ┌──────────────────────────────────────────┐ ┌──────────────────────────────────────────┐  │
│   │ Build a resume you can prove             │ │ Hunt jobs honestly                       │  │ 2 cards r-xl,
│   │ Upload, confirm, export PDF or Word.     │ │ Real jobs ranked to your confirmed       │  │ surface, rim,
│   │ Every line keeps its source.             │ │ skills. A full check quotes the posting. │  │ shadow-1
│   │   ┌ DOM: editor row + tag, bleeding ─────│ │   ┌ DOM: 2 job cards, bleeding ──────────│  │ mockups bleed off
│   │   │ off the right/bottom edge, fades     │ │   │ off the edge, fade to surface        │  │ right/bottom,
│   └───┴──────────────────────────────────────┘ └───┴──────────────────────────────────────┘  │ 160px fade
│                                                                                              │
│   How it works                                                                               │
│   ┌ steps (buttons) ──────────────┐  ┌ picture (live DOM, crossfades on click) ───────────┐  │ 5/7 split
│   │ 1 Upload your resume        ● │  │                                                    │  │ click-only,
│   │ 2 Confirm what's yours        │  │   (step 2: a fact card with signature line)        │  │ no autoplay
│   │ 3 Download PDF or Word        │  │                                                    │  │
│   │ 4 See jobs that fit, honestly │  │                                                    │  │
│   └───────────────────────────────┘  └────────────────────────────────────────────────────┘  │
│                                                                                              │
│   The proof standard                                                                         │
│   ┌──────────────┬──────────────┬──────────────┬──────────────┐                              │ 4 promises in a
│   │ Every line   │ Words, not   │ Real jobs,   │ Free export, │                              │ ruled ledger row
│   │ traces to a  │ scores       │ applied on   │ always       │                              │ (hairlines), each
│   │ fact you     │              │ the company's│              │                              │ with a 24px icon
│   │ confirmed    │              │ own site     │              │                              │
│   └──────────────┴──────────────┴──────────────┴──────────────┘                              │
│   EVERY LINE TRACES TO A FACT YOU CONFIRMED · EVERY LINE TRACES TO A FACT …  (microtext rule)│
│                                                                                              │
│   Who it's for                                                                               │
│   ┌ Students & freshers ─┐ ┌ Early in your career ┐ ┌ Switching or returning ┐              │ 3 cards, sibling
│   │ example facts (DOM)  │ │ example facts (DOM)  │ │ example facts (DOM)    │              │ dimming; each has
│   │ what Hunt does       │ │                      │ │ "career break" fact    │              │ a template reason
│   └──────────────────────┘ └──────────────────────┘ └────────────────────────┘              │
│                                                                                              │
│   Free export. A low price for the rest.                                                     │
│   ┌ Free, always (grain card) ────────────────┐  ┌ More job checks ─────────────────────┐    │
│   │ Upload + confirm facts                    │  │ ₹[owner sets]/month · cancel anytime │    │ until priced:
│   │ Master resume + edits                     │  │ Price shown before you pay.          │    │ "Coming later.
│   │ PDF and Word downloads                    │  │                                      │    │  The price will
│   │ Jobs feed + 30 job checks a month         │  │                                      │    │  be here first."
│   └───────────────────────────────────────────┘  └──────────────────────────────────────┘    │
│                                                                                              │
│   Questions                                    (FAQ: 6-8 <details>, 760 wide, hairlines)     │
│                                                                                              │
│ ╭──────────────────────────────────────────────────────────────────────────────────────────╮ │ CLOSING BAND
│ │  ~~~~~~~~~~~~ guilloche wave ~~~~~~~~~~~~                                                 │ │ --mk-panel, grain,
│ │  Your next resume, ▌signed▐ by you.          [ Build my resume, free ]                   │ │ r-2xl, centred
│ ╰──────────────────────────────────────────────────────────────────────────────────────────╯ │
│ ╭ FOOTER --mk-footer + grain, r-2xl top corners ──────────────────────────────────────────╮  │
│ │ Hunt   Product · How it works · Pricing · FAQ · Privacy · Terms · Report a fake job      │  │
│ │ Made in India. No hiring probabilities, no fake scores.          © 2026                  │  │
│ ╰──────────────────────────────────────────────────────────────────────────────────────────╯  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Phone**

```
┌────────────────────────────┐
│╭──────────────────────────╮│  nav (floating, 12px inset)
││ Hunt   [Build my…]  ≡    ││
│╰──────────────────────────╯│
│╭──────────────────────────╮│  hero panel r-xl, 12px inset
││ A resume where every     ││  H1 40-44px
││ line has ▌proof.▐        ││
││ Upload the resume you    ││  lead 17px
││ have. Confirm what's …   ││
││ [ Build my resume, free ]││  full-width large button
││ See a job check →        ││
││ Free PDF + Word export   ││
││ ┌ resume sheet ─────────┐││  mockup below the text,
││ │ • Cut checkout load …─┼┼╮ tap a line → tag card
││ └───────────────────────┘││ appears under it (no trace
││ ◁○ F-15 · Confirmed …    ││ line on phone)
││ ┌ job check ───── (seal)┐││  cropped by panel bottom
╰╰─┴───────────────────────┴╯  with fade
│ Two things Hunt does       │  cards stacked
│ How it works               │  steps as accordion; picture
│  1 Upload ▾ (picture)      │  opens under the chosen step
│  2 Confirm                 │
│ The proof standard         │  2×2 grid of promises
│ Who it's for               │  cards stacked (no dimming)
│ Pricing                    │  stacked
│ Questions                  │
│ Closing band · Footer      │
└────────────────────────────┘
```

Hero details:
- H1: "A resume where every line has *proof*." `--t-hero`, `--mk-text`; "proof." in the italic with the
  proof mark (always on, static). Lead `--t-lead`, `--mk-muted`, max 34ch. Primary: on-panel button
  (large). Secondary: text link in `--mk-text` with accent-free underline.
- **Live DOM mockup** = real `JobCard`/`RequirementRow`/tag components with sample data (Rohan Iyer,
  Kestrel Pay, Lumen Health), rendered server-side. Do not hide it with `aria-hidden`: it is a labelled
  `figure` ("Example: a resume line linked to the fact it came from") so screen readers read it as text.
- Interaction: three resume lines are buttons. Hover/focus/tap a line → its tag card highlights, the
  trace line draws (SVG path `stroke-dashoffset` 300ms), the source's proof mark swipes on. Line 2 is
  linked on first paint (static; nothing autoplays). Under reduced motion all of it is instant.
- The job-check mini card shows the visitor's real date ("Checked today, Fri 6 Nov", `Intl.DateTimeFormat`
  with the browser locale, rendered on the client after hydration; server renders without the weekday to
  avoid a hydration mismatch). The seal presses in once, 400ms after hydration (skipped under reduced
  motion and Save-Data). That is the only load-time motion on the page.
- LCP element is the H1 (text). No hero image. Mockup + panel ≤ 40 KB of HTML.

Copy rules: our own words, plain English at 8th-grade level, no "AI-powered", no superlatives, no user
counts, no testimonials, no competitor names.

### 4.2 Upload (`/onboarding?step=upload`)

**Desktop** (`--w-narrow` centred column; tab bar/nav as usual; onboarding uses a reduced top bar:
wordmark + "Step 1 of 3" + Help)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Hunt                                   Step 1 of 2 · Upload      Help  │
├────────────────────────────────────────────────────────────────────────┤
│                 Start with the resume you have                         │ --t-d2
│                 We read it and show it back as a resume. You check it  │ muted
│                 once, then it's built.                                 │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐     │
│     (icon) Drop your resume here                                      │ dropzone 3.12
│            PDF, Word or text, up to 10 pages   [ Choose file ]        │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘     │
│   No resume? Start from a few questions →                              │
│   (lock) Free PDF and Word export. Read in a sealed sandbox, never shared. │ lock = SVG icon
│                                                                        │
│   What happens next                                                    │ 3 numbered rows,
│   1 We read your roles, dates and numbers, word for word               │ --t-sm, hairlines
│   2 You see it as a resume and untick anything that's wrong            │
│   3 One click builds it, then we suggest improvements                  │
└────────────────────────────────────────────────────────────────────────┘
```

**Phone:** same column at full width; dropzone becomes a card with the icon, "Choose your resume" primary
full-width button (the drop text is hidden under 600px: phones don't drag), and the two lines below. "Read my
resume" moves straight to 4.3, which shows the reading stages beside the preview skeleton.

### 4.3 Check and build (`/onboarding?step=confirm`)

Replaces the one-at-a-time confirm queue, the quick question and the separate About / Goals steps (owner,
2026-11-21). Onboarding is two steps: Upload, then this.

**Desktop** (`--w-app`, two columns 5/6; preview sticky at `top: 88px`)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Step 2 of 2 · Check and build                                                             │
│ Check what we read                          │ Preview · Compact Tech                      │
│ Ticked lines go on your resume as written…  │ Recommended for Software Developer…         │
│ ┌ Role · Org, City / dates ──────────────┐  │ ┌───────────────────────────────────────┐   │
│ │ [x] Gave teams live visibility of 5,000+│  │ │  A4 ResumePaper, live: unticking a    │   │
│ │     [I did it myself ▾]  Edit           │  │ │  line removes it, edits and contact   │   │
│ │ [ ] Line that's wrong (struck through)  │  │ │  fields show at once                  │   │
│ └─────────────────────────────────────────┘  │ └───────────────────────────────────────┘   │
│ ┌ Education ┐ ┌ Top of your resume ┐ ┌ What you're aiming for ┐                            │
│                       [ Build my resume with 8 lines ] (primary)                           │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- **While reading** the left shows the file row, a StageList driven by the real task state (uploading → waiting
  for a reader → finding roles, dates and numbers → laying out your preview) and three plain lines on what we do
  with the file; the right shows a page-shaped skeleton. **While building**, a StageList (confirming N lines →
  saving details → writing in <template>).
- Numbers in lines: weight 600 with a dotted `--partial` underline (the only call-out; no per-number chips).
- Level select labels speak plainly: I contributed / I did it myself / I led it / I managed people on it.
- Unticked lines are marked "not mine" on build (kept, never deleted; said under the button).
- **Phone:** one column, preview below the form; the build button sits in the bottom action bar.

### 4.4 Resume editor + preview (`/resumes/[id]`)

**Desktop** (`--w-app`, 5/7 split; the preview column is sticky under the header strip)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ ╭ nav bar ────────────────────────────────────────────────────────────────────────────╮   │
├───────────────────────────────────────────────────────────────────────────────────────────┤
│ Master resume  v3 · saved                 Template (Classic ▾)  [⋯]  [Word] [Download PDF]│ sticky page bar
├───────────────────────────────────────┬───────────────────────────────────────────────────┤
│ Summary                          Edit │  ┌ stage --bg-sunken ─────────────────────────┐  │
│ ─────────────────────────────────────  │  │   ┌ A4 sheet --paper-white ─────────────┐  │  │
│ Experience                            │  │   │ ROHAN IYER                          │  │  │
│  Kestrel Pay · Frontend Engineer      │  │   │ …                                   │  │  │
│  ┌──────────────────────────────────┐ │  │   │ • Cut checkout load from 4.1s to    │  │  │ hovered line
│  │ Cut checkout page load from 4.1s │ │  │   │   2.3s …  ⟦ring⟧                    │  │  │ outlined
│  │ to 2.3s by splitting the bundle. │ │  │   │                                     │  │  │
│  │ ◁○ F-15  ✓ checked     [Rewrite] │ │  │   └─────────────────────────────────────┘  │  │
│  └──────────────────────────────────┘ │  │   Page 2                                  │  │
│  • Built the shared React component … │  └────────────────────────────────────────────┘  │
│  + Add a line from your facts         │                                                   │
│ Education · Skills · Languages        │                                                   │
└───────────────────────────────────────┴───────────────────────────────────────────────────┘
```

- Statement row: text (`--t-body`), below it the fact tag(s) + truth status ("checked" mark or "checking…")
  + actions on hover/focus (Rewrite, Remove, Move). Focusing a row swipes on the proof mark in the fact
  popover and outlines the line in the preview.
- Blocked edit (an edit that adds a claim the facts don't support): inline `--conflict-bg` note under the
  row: "This adds 'led', but F-15 says you owned it. [Use 'owned'] [Edit the fact]". Never silent.
- Share, Duplicate, Rename, Delete live in the `⋯` overflow menu. Downloads stay in the sticky page bar.

**Phone**

```
┌────────────────────────────┐
│ ← Master resume   v3 [⋯]   │
│ ( Edit | Preview )         │  segmented, swaps panes (no side-by-side)
│ Experience                 │
│ ┌────────────────────────┐ │
│ │ Cut checkout page …    │ │
│ │ ◁○ F-15 ✓   [Rewrite]  │ │
│ └────────────────────────┘ │
├────────────────────────────┤
│ [ Word ]  [ Download PDF ] │  bottom action bar
└────────────────────────────┘
```

### 4.5 Find jobs (`/jobs`, default tab) and Improve (`/improve`)

We don't list jobs (owner, 2026-11-21). Find jobs builds a search from the confirmed profile and opens it on the
big job sites; the user pastes a job they like back for the check (4.6).

```
│            Jobs                                                    [ Paste a job ]        │ page header
│            ( Find jobs )  ( Saved & pasted · 3 )                                          │ tabs (links)
│            Search the big job sites, then paste a job here… · 29 of 30 job checks left    │ quota once, muted
│            ┌ Your search ─────────────────────────────────────────────────────────┐       │ base card
│            │ Built from your confirmed profile · 7 years of experience.           │       │ --t-sm muted
│            │ [Role                       ] [City              ]                   │       │ 3fr / 2fr ≥600px
│            │ [ ] Remote jobs only                                                 │       │
│            │ (✓ React)(✓ TypeScript)( Next.js )( Jest )                           │       │ filter chips (3.5)
│            └──────────────────────────────────────────────────────────────────────┘       │
│            ┌ LinkedIn                                   [Search ↗] ┐                       │ link card per site,
│            │ Posted in the last week                               │                       │ stretched link,
│            └───────────────────────────────────────────────────────┘                       │ new tab
│            … Naukri · Indeed · Wellfound · Company career pages · Instahyre               │
│            Found a job you like? Paste it here and we'll check how well you fit.          │ --t-sm muted
```

- One `--w-feed` column. The site card is a base card (3.8) with the site name as the stretched link and a
  decorative secondary "Search" button with the `external` icon; "(opens in a new tab)" is screen-reader text.
- No profile yet: empty state "Start with your resume" → Upload my resume.

**Improve** (`/improve`, after onboarding and from "Improve my resume" on the Resume page). One `--w-feed`
column of base cards in two groups with `--type-h` headings: **Fix these first** and **Worth a look**. Each card:
title (`--type-title`), one muted sentence of why, then the action. "Edit this line" shows the user's own fact in a
`--bg-sunken` quote block, then a textarea ("Save my wording"); "Add a number" cards have a textarea and "I don't
know"; link cards have one secondary button. "Leave it" is a ghost button. Done cards become a dashed note with a
`--supported` check. Status marks (3.6) are not used here: they mean data states, not urgency. The page ends with
"Pick a template" (primary, → `/resumes`) and "Find jobs".

**Resume list** opens with **Pick a template**: the newest master resume rendered in all six templates (the
editor's gallery, page-shaped A4 thumbnails, sibling dimming), one marked with a "Recommended for you" badge.

### 4.6 Job check (`/jobs/[id]`)

**Desktop** (`--w-app`; main column 8/12; no permanent sidebar)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Jobs                                                                                    │
│ Frontend Engineer II                                    [ Apply on company site ↗ ]       │ --t-d2; primary
│ Lumen Health · Remote, India · Full-time · via company site · posted 3 days ago           │ (opens apply dialog
│ ┌──────────────────────────────────────────────────────────────────────────────────┐      │  with the money
│ │  (seal 120)   Good fit with gaps                                                  │      │  warning first time)
│ │               • You have React, TypeScript and testing, the core of this job.     │      │ verdict card:
│ │               • Web performance: you contributed, ownership isn't recorded.       │      │ seal + 2-3 reasons
│ │               • Accessibility (WCAG) isn't in your facts yet.                      │      │ + the 3 biggest
│ │               Biggest gaps: (Accessibility) (Web performance)                      │      │ gaps as chips that
│ │               [ Close a gap ]   Save · Not for me · Report                         │      │ jump to rows
│ └──────────────────────────────────────────────────────────────────────────────────┘      │
│ Eligibility  ✓ Location  ✓ 3+ years  ✓ Full-time  ? Notice period not stated              │ one compact row
│                                                                                           │ (each opens quote)
│ Requirements                                                     Expand all               │
│ Proven · 3   (rows 3.10, collapsed)                                                       │
│ Partly · 1                                                                                │
│ Missing · 1                                                                               │
│ Goal fit  ✓ Matches your goal: frontend engineering at a product company.                 │
│ Checked Fri 6 Nov 2026 from the posting text saved on 5 Nov.   [Re-check]                 │ mono date
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- "Close a gap" (and each Missing/Partly row's action) opens the drawer: what the posting asks (quote),
  "If you have done this, add it as a fact" (short form → goes to confirm), "If not, here's an honest way
  to say you're learning it" (no invented claims). Tailoring is off: no "Tailor resume" CTA anywhere.
- Apply dialog (first time per session): "You'll apply on Lumen Health's own site. No genuine employer
  asks for money to apply or interview." [Continue to site ↗] — opens in a new tab with
  `rel="noopener noreferrer"`.
- While analysing: header renders, seal shows "Checking…", groups render as skeletons; the page polls.

**Phone:** single column; seal 96 centred above the reasons; actions full width; "Apply on company site"
is the bottom action bar's primary; Eligibility row wraps to a 2×2 grid.

### 4.7 Profile (`/profile`)

**Desktop** (`--w-app`, left section nav 220 sticky + content 720)

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ Profile                                                          [ + Add a fact ]          │
│ ┌ On this page ─┐  ┌ Roles and facts ─────────────────────────────────────────────────┐   │
│ │ Roles & facts │  │ Kestrel Pay · Frontend Engineer · 2021-2024              Edit    │   │
│ │ Skills        │  │  • Cut checkout page load from 4.1s to 2.3s …   ◁○ F-15         │   │
│ │ Education     │  │    Owned · Confirmed by you · 12 Oct                             │   │ signature line
│ │ Achievements  │  │  • …                                                             │   │
│ │ Languages     │  └──────────────────────────────────────────────────────────────────┘   │
│ │ Career breaks │  ┌ Skills ─────────────┐ (React•)(TypeScript•)(Jest•)(GraphQL)  …    │
│ │ Goals         │  ┌ Education ┐ ┌ Achievements ┐ ┌ Languages ┐ ┌ Career breaks ┐       │
│ └───────────────┘  ┌ Goals: target roles, locations, notice period, expected CTC (₹ LPA)┐  │ India fields
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

- Each section is one card (no nested cards); rows separated by hairlines. Draft (unconfirmed) items show
  a `--missing` dashed mark "Not confirmed" + Confirm button.
- Editing a fact that resume lines use shows the downstream effect before saving: "2 resume lines use this
  fact. They'll be re-checked." (inline note, not a dialog).
- The section nav is plain anchor links (`aria-current="location"` set on click, not by scroll position:
  owner rule).

**Phone:** section chips at the top (anchor links), sections stacked full width, "Add a fact" as a
secondary button at the top of Roles; tab bar visible.

### 4.8 Settings (`/settings`, from the avatar menu)

**Desktop and phone** (`--w-narrow` single column; grouped list)

```
┌──────────────────────────────────────────────┐
│ Settings                                     │
│ Account                                      │  group = card with rows (56 min height)
│  Name                    Rohan Iyer    Edit  │
│  Email                   rohan@…       Edit  │
│ Appearance                                   │
│  Theme          ( Light | Night | System )   │
│  Language       ( English | हिन्दी )         │
│  Data saver     (switch) Fewer images, no    │
│                 texture, no motion           │
│ Job alerts                                   │
│  Email me new matches   ( Off | Weekly | Daily )
│ Your data                                    │
│  Download everything (JSON + resumes)  [Download]
│  Delete my account and data            [Delete…]  danger; dialog with typed confirm,
│ Sign out                                     │  7-day undo window stated
└──────────────────────────────────────────────┘
```

---

## 5. Resume templates (the documents, not the app)

Unchanged from v1. This system never styles the exported resume.

Six templates, defined once in `shared/resume-templates.json` (typed in `src/lib/templates.ts`, loaded by `api/app/render.py`) and read by the preview, the Typst (PDF) renderer and the DOCX builder. PDFs embed the open fonts (Tinos, Carlito, Arimo, Libertinus Serif); DOCX files name the system font every Word install has (Times New Roman, Calibri, Arial, Cambria), the first three metric-compatible. All are single-column, standard headings, real text, contact in the body, no tables / text boxes / icons / header-footer content; they differ only in type, spacing and section order.

| Template | Modelled on | Best for | Order |
|---|---|---|---|
| Classic | Harvard-style | Most people, senior (1–2 pages) | Summary, Experience, Education, Skills, Languages |
| Compact Tech | Jake's resume | Software engineers | Experience, Projects, Skills, Education, Languages |
| Modern | Clean sans, one muted accent | Product, business roles | Summary, Experience, Skills, Education, Languages |
| Campus | Indian placement format | Freshers, students | Education, Skills, Projects, Experience, Achievements, Languages |
| Combination | Hybrid format | Career switchers, returners | Skills summary with proof, Experience, Projects, Education, Languages |
| Academic CV | Research CV | Researchers, faculty | Education, Experience, Publications, Skills, Languages |

Every template ends with Languages (confirmed spoken languages, one line). A section with no content is left out.
Never purely functional (skills-only, no dated history): screening software expects a timeline.

---

## 6. Implementation notes

### 6.1 Motion (library and reduced motion)

- **CSS first.** Hover, press, focus, disclosure, tabs, nav plate, dialogs (`@starting-style`), page
  enter, proof mark, signature reveal, skeleton pulse: all CSS. Motion only where CSS can't do it well:
  exit animations of list items (confirm queue `AnimatePresence`), toasts stacking, the landing step
  picture crossfade, drag-to-dismiss sheets (optional), the hero seal press.
- **App routes:** `LazyMotion` + `m`, never the full `motion` component.
  ```tsx
  // src/app/providers.tsx ("use client"), used in the root layout
  import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
  export function Providers({ children }: { children: React.ReactNode }) {
    return (
      <MotionConfig reducedMotion="user">
        <LazyMotion features={domAnimation} strict>{children}</LazyMotion>
      </MotionConfig>
    );
  }
  // in components: import * as m from "motion/react-m";  <m.div animate={…} />
  ```
  `strict` makes an accidental `motion.div` import throw in dev. `domMax` (layout animations, drag) is
  loaded only in the component that needs it, via a nested `LazyMotion features={() => import("…")}`.
- **Reduced motion, three layers:** (1) the CSS block in 2.8.1 zeroes all durations; (2)
  `MotionConfig reducedMotion="user"` turns off transform/layout animations in Motion; (3) any JS-timed
  sequence (hero seal press, the trace line, timers) checks `useReducedMotion()` and jumps to its end
  state. There are no loops anywhere, so nothing needs a pause control.
- No `scroll`/`wheel` listeners, no `useScroll`, no `IntersectionObserver` for styling. (IO for loading
  more data is fine; we use a button anyway.)

### 6.2 CSS conventions

- Tokens in `globals.css`; components in CSS Modules (current pattern). No new CSS framework.
- List transitioned properties explicitly. No `transition: all`. `will-change` only during a JS animation.
- `@media (hover: hover)` around every hover style; `:focus-visible` for focus styling.
- Use `:has()` for sibling dimming and form states; `@supports` fallbacks for `linear()`, oklch,
  backdrop-filter, `field-sizing`, anchor positioning.
- `.save-data` on `<html>` (from the `Save-Data` request header, read in the root layout) removes grain,
  guilloche, the seal press and image prefetching.

### 6.3 Images

- The design needs almost no raster images: mockups are DOM, texture is one 14 KB PNG + two SVG masks.
- Raster that remains (template thumbnails, OG image, any future photo): `next/image` with
  `images.formats: ["image/avif", "image/webp"]` in `next.config`, explicit `width`/`height` or `fill` +
  `sizes`, `loading="lazy"` below the fold, `placeholder="blur"` for anything > 10 KB. No image is the LCP
  element on any route. Icons are inline SVG components (one stroke weight: 1.75px at 24, 1.6 at 20).
- `public/brand/*` served with immutable caching; rename to bust.

### 6.4 Fonts

Per 2.2.2. The root layout applies all five `.variable` classes on `<html>`. Preloaded everywhere:
Newsreader roman, Atkinson 400 + 600 (about 110 KB together; check after the first build). Never
preloaded: Newsreader italic, Plex Mono, Noto Sans Devanagari.

### 6.5 Accessibility (WCAG 2.2 AA)

- Contrast per 2.1.3; never put body text on `--line` or decorative colours; status always icon + word.
- Targets ≥ 44×44 on touch (2.5.8 asks 24; we use 44). Inputs 16px+.
- Focus visible on every interactive element; **2.4.11 Focus Not Obscured**: `scroll-padding` (2.10) keeps
  focus clear of the sticky header strip and bottom bars.
- **2.5.7 Dragging:** every drag (dropzone, sheet dismiss, reorder) has a button alternative.
- **3.3.7 Redundant entry:** never ask for a fact the user already confirmed; prefill.
- **3.3.8 Accessible authentication:** no puzzles; email OTP fields allow paste and `autocomplete="one-time-code"`.
- **3.2.6 Consistent help:** "Help" in the same place on every onboarding step and in the avatar menu.
- Landmarks: skip link first ("Skip to content"), `<header>`, `<nav aria-label="Main">`, `<main>`,
  `aria-current="page"`. Live regions: one polite region for toasts, one for async status (upload stages,
  "Checking…").
- Respect zoom (no `maximum-scale`), test at 200% text and 400% zoom (320 CSS px reflow).
- `forced-colors`: rims swap to real borders (2.6), proof uses `Mark`, marks keep their icons.
- `lang` on `<html>` matches the UI language; Devanagari user text gets `lang="hi"` when known.
- Test with TalkBack on Android Chrome (the main real-world screen reader here) and NVDA + Chrome.

### 6.6 Performance budgets (enforce in CI; measured with Slow 4G + 4× CPU)

| Route | JS gzip | CSS | Fonts | LCP | Other |
|---|---|---|---|---|---|
| Landing | ≤ 170 KB | ≤ 30 KB | ≤ 110 KB preloaded | ≤ 2.5s | CLS ≤ 0.02; LCP = H1 text |
| Upload, confirm | ≤ 150 KB | ≤ 25 KB | shared | ≤ 2.5s | INP ≤ 200ms |
| Jobs feed, job check | ≤ 150 KB | ≤ 25 KB | shared | ≤ 2.5s | INP ≤ 200ms; no Motion on the feed |
| Editor | ≤ 250 KB, preview lazy | ≤ 35 KB | + mono | ≤ 3.0s | — |

- `backdrop-filter` only on navs: the landing nav and the app's nav bar + phone tab bar (owner call, 2026-11-21), each with a solid `--surface` fallback (`@supports not` and `.save-data`) and solid while a panel is open. Blur filters only per 2.8.2.
- Server Components by default; client islands are the nav, interactive cards, forms, dialogs.
- Lists: `content-visibility: auto`. No prefetch of other routes under Save-Data.

### 6.7 Migration from v1

| v1 token | v2 token |
|---|---|
| `--paper` | `--bg` |
| `--surface` | `--surface` |
| `--text`, `--text-muted` | same names (new values) |
| `--rule` | `--line` |
| `--border-strong` | `--line-strong` |
| `--primary`, `--on-primary`, `--primary-hover` | `--accent`, `--on-accent`, `--accent-hover` |
| `--highlighter`, `--on-highlighter` | `--proof`, `--on-proof` |
| `--supported(-bg)`, `--partial(-bg)`, `--conflict` | same names (new values) |
| `--no-evidence`, `--gap(-bg)`, `--unknown` | `--missing(-bg)` |
| `--r-sm/md/lg` (4/6/10) | `--r-xs/sm/md/lg/xl/2xl` (4/8/12/16/24/32) |
| `--s-*` | `--sp-*` |
| `--ease-out` (0.2,0.7,0.2,1) | `--ease-out` (0.23,1,0.32,1) + full set in 2.8.1 |

Keep the v1 names as aliases (`--paper: var(--bg)` …) during the rebuild; delete them in the last step.
Retire: Archivo, Kalam, JetBrains Mono, `Doodles.tsx` line art, the `ink-wobble`/`stamp-ink` SVG filters,
hard offset shadows, rotated stamp lettering, the yellow/mint marketing bands, `HeroDesk`, `Story`,
`Receipt`, `WhoFor` (rebuilt as the sections in 4.1). Navigation: Feed and Skills leave the nav; `/feed`
redirects to `/jobs` (For you), `/skills` to `/profile#skills` (PRODUCT-PLAN §3, now approved with the
redesign).

### 6.8 Build plan (in order; each step ships behind nothing, keeps the app working, and passes its checks)

| # | Step | Contents | Done when |
|---|---|---|---|
| 1 | **Foundation** | Tokens (2.1-2.10) in `globals.css` with v1 aliases; `fonts.ts`; `public/brand/` assets from the scripts; `providers.tsx` (MotionConfig + LazyMotion); theme script; `.save-data` class; primitives: Button, IconButton, Input/Textarea/Select, Checkbox/Switch, Segmented, Chip, StatusMark, ProofMark, FactTag, SignatureLine, Card, Disclosure, Tabs, Dialog/Drawer/Sheet, Toast, Skeleton, Empty/Error; **app shell** (desktop nav + morphing plate, compact top bar, bottom tab bar, bottom action bar, page header, page enter); **`/kit` page** (dev/admin only) rendering every component in every state, both themes, at 360 and 1280, plus a Devanagari row | Kit page passes axe with 0 violations; keyboard walk of the nav plate works; reduced-motion check (DevTools emulation) shows no movement; no `cursor:` and no `transition: all` in `src/` (grep in CI) |
| 2 | **Landing** | Nav with Product plate + phone morph menu; hero panel with grain + rosette + live DOM mockup + real date; Two things; How it works stepper; Proof standard; Who it's for; Pricing promise; FAQ; closing band; footer | Lighthouse mobile ≥ 95 perf/100 a11y; LCP is the H1; budgets in 6.6; looks complete with Save-Data on |
| 3 | **Onboarding: upload + confirm** | Upload screen + dropzone states + stage list; confirm queue with fact cards, numbers callout, confirm-all, undo, keyboard | Real resume (owner's) imports and confirms end-to-end on a throttled Android profile; every state reachable in the kit |
| 4 | **Resume** | Editor rows with tags, blocked-edit notes, preview frame + template picker, overflow menu, sticky downloads; phone Edit/Preview | PDF and Word download from phone and desktop; preview scale correct at 360-1440 |
| 5 | **Jobs feed** | Tabs, quota line, URL filters + drawer, job cards (all fields, salary fallback, reason line), save/report, load more, feed settings drawer, paste dialog, empty states | Feed route ≤ 150 KB JS; Back restores scroll and pages; filters survive reload |
| 6 | **Job check** | Header + apply dialog, verdict card with seal press, eligibility row, grouped requirement rows, close-a-gap drawer, analysing state | Every status maps per 2.1.2; no percentages anywhere (grep for `%` in rendered job-check text) |
| 7 | **Profile + settings** | Section nav, section cards, fact edit with downstream note, goals (India fields); settings groups incl. theme, language, data saver, alerts, data export/delete | Theme and language persist; delete flow has typed confirm + undo window |
| 8 | **Cleanup** | Remove v1 aliases, retired components and fonts; update `docs/HANDOFF.md` | No v1 token names left (`grep -r "\-\-paper\|--highlighter" src` is empty) |

Redesign one journey at a time (PRODUCT-PLAN rule); after each step, run the owner's real resume through it.

---

## 7. Do and don't

**Do**
- Show proof on demand for every claim; keep the proof mark for verbatim text only.
- Name outcomes on buttons; one primary per view.
- Paint everything on arrival; make every state readable with no JS and no motion.
- Use real DOM and sample data (clearly sample) for marketing visuals; show the visitor's real date.
- Pair every status colour with an icon and a word; keep "missing" calm and grey.
- Test at 360px, at 200% text, in night theme, with Devanagari, with Save-Data, on a throttled Android.

**Don't**
- Don't show scores, percentages, gauges, rings or stars for fit or quality.
- Don't animate on scroll or reveal on scroll; don't add autoplay loops or marquees.
- Don't set `cursor:`; don't use `transition: all`; don't use `backdrop-filter` in the app outside the nav bar and tab bar.
- Don't use yellow anywhere except the proof mark; don't use manila except fact tags.
- Don't nest cards; don't use eyebrow labels; don't use text glyphs or emoji as icons.
- Don't use testimonials, user counts, company logos, or fake people.
- Don't put security print, grain or the italic display voice inside the app's working screens (the
  signature line is the one exception).

---

## 8. What we took from craft.do (technique only)

### 8.1 Never copied
Untitled Serif/Sans, the pastel section palette (sky, periwinkle, mint, butter, peach), `#FCF9F7`/`#030302`,
torn-paper and cloud collage, halftone, giant outlined wordmark, pill-shaped everything, their copy and
assets, app-window chrome, people/logo marquees, the scroll-docking nav, the mobile scroll-scale card.

### 8.2 Borrowed, re-expressed
Inset rounded hero panel · one shared grain (ours: generated noise, used on indigo and cream) · SVG-mask
shapes (ours: guilloche rosette/wave; tag and seal shapes in CSS) · live DOM mockups with the visitor's
real date · gradient-rim borders · layered low-alpha shadows · serif display with an italic accent word
(ours: Newsreader, and the italic doubles as the signature voice) · a nav that morphs into its menu ·
sibling dimming on hover · blur crossfades (step pictures only) · CTA sheen · metric-matched font
fallbacks for CLS 0.

---

## 9. Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-11-21 | **Onboarding is Upload → Check and build** (4.3): one split screen with a live resume preview replaces the one-at-a-time confirm, quick questions, About and Goals steps; Improve adds Google's XYZ checks and asks for a rewrite of the same line instead of a separate "number" fact. | Owner: the post-upload questions and confirmations felt useless; wants to see the resume while it's read. |
| 2026-11-21 | **Journey is upload → Improve → Pick a template → Find jobs.** The jobs feed (4.5 old), feed settings, job reporting and alert emails are removed; Find jobs links out to job sites; template gallery leads the Resume page; new Improve screen. | Owner: listing jobs ourselves is wasted effort; the value is the resume and searching the big sites with it. |
| 2026-11-06 | **Design system v2 "Signed in blue" replaces v1 "Attested notebook".** New palette (bond paper, blue-black ink, ballpoint-blue accent, manila tags; yellow kept only as the proof mark), new type (Newsreader display with italic accent, Atkinson Hyperlegible Next UI, IBM Plex Mono for verbatim, Noto Sans Devanagari), security-print texture on marketing only, layered soft shadows + gradient rims instead of hard offsets, rounded-rect buttons, morphing nav plate, 3-item nav (Jobs / Resume / Profile; Settings under the avatar). | Owner asked for a complete redesign at the craft.do quality bar and approved replacing the look. v1's notebook/line-art/stamp language read as hand-made rather than trustworthy; "an original document" carries the truth promise better and is ours (Indian blue-ink originals, stamp paper security print). Borrowed craft techniques, not identity (section 8). |
| 2026-11-06 | Kalam, Archivo, JetBrains Mono retired; hand-drawn art, tilted cards and stamp lettering retired | One display voice (Newsreader italic) replaces three expressive devices; saves two font families on slow networks. |
| 2026-11-06 | No in-view reveals; the only load-time motion is the landing seal press (once, skipped under reduced motion/Save-Data) | Owner rule; craft.do itself uses none. |
| 2026-11-06 | Statuses regrouped for the job check as Proven / Partly / Missing; `no_evidence`, `gap` and `unknown` share the calm `--missing` colour with distinct icons | PRODUCT-PLAN §3 job-check proposal; fewer colours, same honesty. |
| 2026-11-06 | Landing is light-only; app supports Light / Night / System (default Light) | One first impression; night is for late editing. |
| 2026-11-04 | Languages section added at the end of every resume template | Owner approved; languages were stored but only shown on the profile. (Still in force.) |
| 2026-10-11 | Six ATS-safe resume templates with an in-editor gallery | Owner asked for the 5–6 commonly recommended templates. (Still in force, section 5.) |
| 2026-10-08 → 10-10 | v1 "Attested notebook": paper, forest ink, highlighter, stamps, verdict seal, two volumes; scroll animation removed; landing expanded to explain both products | v1 history. Kept in v2: highlighter as proof only, verdict seal instead of gauges, no scores, two volumes, no scroll motion, no testimonials, no cursor changes. |
