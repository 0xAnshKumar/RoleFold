---
# gstack: design-md-format=spec
name: Hunt (working name)
description: An attested notebook. A career record on warm paper, marked up in forest ink, proof highlighted, statuses stamped. Calm, honest, quietly warm.
colors:
  paper: "#FAF7EF"
  surface: "#FFFDF8"
  text: "#173A2A"
  text-muted: "#55665B"
  rule: "#D9D3C3"
  border-strong: "#7D877F"
  primary: "#173A2A"
  on-primary: "#FAF7EF"
  primary-hover: "#0F2A1D"
  highlighter: "#FFE45C"
  on-highlighter: "#173A2A"
  status-supported: "#1E6B3A"
  status-supported-bg: "#DDEFE2"
  status-partial: "#8A5A00"
  status-partial-bg: "#FBEBC4"
  status-no-evidence: "#5B6270"
  status-gap: "#9A3412"
  status-gap-bg: "#FCE7DC"
  status-conflict: "#B42318"
  status-unknown: "#31507A"
  success: "#1E6B3A"
  warning: "#8A5A00"
  error: "#B42318"
  info: "#31507A"
  dark-paper: "#11221A"
  dark-surface: "#172C22"
  dark-text: "#EFEBDD"
  dark-text-muted: "#B3BFB4"
typography:
  display:
    fontFamily: Archivo
    fontWeight: 800
    fontStretch: 112%
    fontSize: clamp(2.25rem, 1.4rem + 3.4vw, 4.5rem)
    lineHeight: 1.04
    letterSpacing: -0.015em
  heading:
    fontFamily: Archivo
    fontWeight: 700
    fontStretch: 104%
    fontSize: 1.5rem
    lineHeight: 1.2
  body:
    fontFamily: Atkinson Hyperlegible Next
    fontWeight: 400
    fontSize: 1rem
    lineHeight: 1.55
  label:
    fontFamily: Atkinson Hyperlegible Next
    fontWeight: 600
    fontSize: 0.8125rem
    lineHeight: 1.3
  stamp:
    fontFamily: Archivo
    fontWeight: 800
    fontStretch: 70%
    fontSize: 0.75rem
    letterSpacing: 0.06em
    textTransform: uppercase
  mono:
    fontFamily: JetBrains Mono
    fontWeight: 400
    fontSize: 0.875rem
    fontFeature: tnum
  margin-note:
    fontFamily: Kalam
    fontWeight: 400
    fontSize: 1.25rem
    lineHeight: 1.35
rounded:
  sm: 4px
  md: 6px
  lg: 10px
  seal: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  4xl: 80px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    shadow: "0 2px 0 #0F2A1D"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-active:
    shadow: "0 0 0 #0F2A1D"
    translateY: 2px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    borderColor: "{colors.text}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border-strong}"
    rounded: "{rounded.sm}"
  focus-ring:
    outline: "2px solid #173A2A"
    outlineOffset: 2px
  panel:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.rule}"
    rounded: "{rounded.lg}"
  stamp:
    rounded: "{rounded.sm}"
    borderWidth: 1.5px
  evidence-mark:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.on-highlighter}"
---

# Hunt (working name)

## Overview

**Creative North Star:** an attested notebook. The product is a career record on paper: claims written in ink, the proof behind each one highlighted, every assessment stamped. The memorable thing, "every line is true, and I can see why", is visible on every screen because each visual device means a truth state.
**Product context:** free web app that builds truthful, ATS-safe resumes from a user-confirmed professional profile and explains job fit requirement by requirement, never as a score. Job seekers of every profession and career stage; launch market India.
**Mode per surface:** Landing = Persuade (expressive, poster-like). Onboarding = Persuade/Operate. Resume editor, match page, confirmation queue = Operate (dense, calm). Empty states and guided questions = warm (margin notes, line art).
**Reference sites:** saybriefly.com (owner's reference look: paper, ink, highlighter, hand-drawn line art; adapted, not copied). Category researched: kickresume.com, rezi.ai, tealhq.com, naukri.com (score gauges, big claims, single loud CTA colour: what we deliberately avoid).
**Key characteristics:**
- Warm paper ground, forest-ink text, no pure black, no pure white page.
- Two volumes: the marketing page is loud (colour-blocked bands, hand-drawn ink art, marker swipes, looping demos, giant wordmark); the app is calm and dense.
- In the app, yellow highlighter appears only behind proof (a quoted job sentence, a source fact). On marketing it may also mark the one key word of a headline and fill one full-bleed band.
- Statuses are inked stamps: word + symbol + shape. Colour is never the only signal.
- No numbers that judge the person: no gauges, rings, percentages or scores anywhere.
- Hand-drawn warmth is reserved for onboarding, empty states and the landing page.

## Colors

**Strategy:** Restrained + semantic. Ink and paper do almost all the work; colour is spent only on meaning (proof = highlighter, status = stamp colours).
**Light or dark:** light paper is the default because the primary use scene is a phone in daylight (uploading, confirming, reading a match). A night variant (dark paper `dark-*` tokens) serves late-evening desktop editing; it keeps the highlighter yellow (text on it stays dark ink) and lifts surfaces by tone, not by glow.

Interaction: primary actions are solid ink with paper text. Secondary actions are outlined in ink. Links are ink with an underline. Focus is a 2px ink outline with 2px offset on every interactive element.

Status mapping (each a stamp; all text pairs pass WCAG AA, measured 5.0 to 7.7:1):
| Status | Stamp | Colour | Symbol and word |
|---|---|---|---|
| Supported / Match | solid fill | status-supported on status-supported-bg | ✓ SUPPORTED / MATCH |
| Partial | half-filled | status-partial on status-partial-bg | ◐ PARTIAL |
| No evidence recorded | dashed outline, no fill | status-no-evidence | – NO EVIDENCE YET |
| Confirmed gap (user said so) | solid fill with strike rule | status-gap on status-gap-bg | ✕ GAP (YOU CONFIRMED) |
| Conflict (failed gate) | double border | status-conflict | ! CONFLICT |
| Unknown | outline | status-unknown | ? UNKNOWN |

"No evidence yet" is deliberately the quietest stamp: an empty box to fill, never red, because missing evidence is not a missing skill.

Contrast record: ink on paper 11.7:1; muted ink 5.7:1; ink on highlighter 9.9:1; border-strong 3.5:1 (inputs); rule 1.4:1 (decorative dividers only, never the sole boundary of a control); dark ink on dark paper 13.9:1.

## Typography

- **Archivo** (Google Fonts, OFL, variable width 62-125, weight 100-900). Display at 800 and 112% width: chunky, confident, slightly wide like a stamped heading. The same family at 70% width, 800, uppercase is the stamp lettering, so stamps and headlines feel cut from the same press.
- **Atkinson Hyperlegible Next** (Google Fonts, OFL, weight 200-800). Body and UI. Chosen for legibility on small, cheap screens in bright light and for readers of every background; distinguishes look-alike characters (l/I/1, O/0), which matters for dates, numbers and IDs.
- **JetBrains Mono** (Google Fonts, OFL, weight 100-800) with tabular figures. Used only for things copied exactly: quotes from a job posting, fact IDs, dates, version labels. Monospace signals "verbatim, not generated".
- **Kalam** (Google Fonts, OFL, Indian Type Foundry; Latin + Devanagari; 300/400/700). Margin notes only: guided enrichment questions, empty-state captions, the landing page's closing line. Max two lines, min 18px, never for data, labels or controls.

Loading: Google Fonts CSS2 with `display=swap`; subset Latin at launch; preload Archivo 800 and Atkinson 400/600 only on the landing page; Kalam and JetBrains Mono load on demand. Self-host the same files via the build if third-party font requests are disallowed by privacy policy.

Scale (body 16px): label 13 / body 16 / lead 18 / heading 24 / section 32 / display 36-72 (fluid). Display never exceeds 4.5rem in the app or 6rem on the landing page.

Not for resumes: exported resumes use the separate ATS-safe template fonts (embedded in PDF; standard system fonts named in DOCX). This system never styles the resume document itself.

## Layout

- Breakpoints: 0-599 (phone, single column, bottom action bar), 600-1023 (tablet, single column with side sheets), 1024+ (desktop, 12-column grid, 24px gutters, max content width 1200px).
- App: grid-disciplined, left-aligned, compact-comfortable density (12-16px between related rows, 24-32px between sections).
- Resume editor (desktop): structure on the left (5 cols), live Typst preview on the right (7 cols); each statement has a counterfoil stub (a dashed-edge strip on its left) that holds the source fact in mono. On phones the stub collapses to a small "source" tab that flips open on tap.
- Match page: verdict seal and job header on top; Eligibility, Requirements, Goal fit, Questions stacked in the main column (8 cols); "What would close the gaps" in a 4-col side column (moves below on phones).
- Landing: poster first viewport, left-aligned headline with one highlighted word, one sentence, one action, and a real resume line with its torn counterfoil stub as the hero object. No centred hero, no screenshot floating in a void, no 3-column feature grid.

## Marketing surface (loud volume)

- Bands, top to bottom: paper hero, ink band (white text, yellow accents), full highlighter-yellow band, mint band `#DCEFE0`, paper close, ink footer with a giant yellow wordmark.
- Mono labels on a tilted highlighter strip introduce a band (owner's reference look; deliberately kept).
- Hand-drawn ink line art with a slight wobble filter, meaningful only: a rubber stamp verifying a resume, a chai cup. Placeholders until commissioned.
- No scroll-driven or scroll-pinned animation anywhere (owner's rule). Motion is time-based or click-driven.
- Hero desk (the first impression): on load it plays once: the resume lands, its lines write, two fact cards arrive and get CONFIRMED stamps, their lines light up with the fact ID they came from, a pasted job ticket slides in and the verdict seal lands (~3s). Afterwards it can be stamped by click, tap or keyboard. Notebook ruling and a margin line sit behind the hero.
- "How it works" is five numbered steps; each has its own finished picture (old resume to drafts, confirmed facts, resume with fact tags, a blocked edit with its reason, a job verdict). Only a click changes the step: the picture crossfades and its stamps press in. No auto-advance, no shared timeline. On phones the picture opens under the chosen step. Hover is a quiet hint, never the selected look.
- The hero desk draws itself in ink on load and can be stamped by click, tap or keyboard (Enter/Space).
- No eyebrow labels above headings; stamp symbols are authored SVG icons, not text glyphs; ::selection, caret, accent and scrollbar colours come from the palette.
- Looping demos show the product's rules (an inflated line gets stamped BLOCKED). Every loop has a static end state under reduced motion and never hides text.
- Hard offset shadows (8-10px, ink or yellow) and small tilts (1-3 degrees) on cards; never on app UI.

## Resume templates (the documents, not the app)

Six templates, defined once in `shared/resume-templates.json` (typed in `src/lib/templates.ts`, loaded by `api/app/render.py`) and read by the preview, the Typst (PDF) renderer and the DOCX builder. PDFs embed the open fonts (Tinos, Carlito, Arimo, Libertinus Serif); DOCX files name the system font every Word install has (Times New Roman, Calibri, Arial, Cambria), the first three metric-compatible. All are single-column, standard headings, real text, contact in the body, no tables / text boxes / icons / header-footer content; they differ only in type, spacing and section order.

| Template | Modelled on | Best for | Order |
|---|---|---|---|
| Classic | Harvard-style | Most people, senior (1–2 pages) | Summary, Experience, Education, Skills |
| Compact Tech | Jake's resume | Software engineers | Experience, Projects, Skills, Education |
| Modern | Clean sans, one muted accent | Product, business roles | Summary, Experience, Skills, Education |
| Campus | Indian placement format | Freshers, students | Education, Skills, Projects, Experience, Achievements |
| Combination | Hybrid format | Career switchers, returners | Skills summary with proof, Experience, Projects, Education |
| Academic CV | Research CV | Researchers, faculty | Education, Experience, Publications, Skills |

Never purely functional (skills-only, no dated history): screening software expects a timeline.

## Elevation & Depth

Paper on a desk. Depth comes from offset, never glow: buttons have a 2px hard ink offset (pressed paper); panels sit on paper with a 1px rule and no shadow; overlays (side sheets, menus) use a short soft shadow `0 6px 20px rgba(23,58,42,0.12)` plus a rule. No zero-offset coloured halos, no frosted glass.

## Shapes

Small radii: 4px (inputs, stamps), 6px (buttons), 10px (panels, sheets). The verdict seal is the only circle. Nested inner radius = outer radius minus the gap. No pills, no bubbly uniform rounding.

## Components

- **Button primary:** ink fill, paper text, 6px radius, 2px ink offset. Hover darkens ink; active removes the offset and shifts down 2px; focus-visible ink outline; disabled = muted ink at 40% with no offset, plus a reason on hover/tap.
- **Stamp:** inline, Archivo 70% width uppercase 12px, symbol first, 4px radius, 1.5px border. Never alone: always next to the item it judges. Screen-reader text spells the full status ("Status: no evidence recorded").
- **Verdict seal:** circle with the verdict words, rotated 3-4 degrees; below it, the 2-3 plain-language reasons. Never a number.
- **Evidence mark:** highlighter background behind verbatim quotes and source facts; on hover/focus of a resume line, its source fact gets the mark and the line gets an ink underline (linked pair).
- **Counterfoil stub:** dashed left edge, mono source fact, fact ID and confirmed date; shows a freshness badge when the fact changed ("fact updated: 30% → 25%").
- **Margin note:** Kalam text in ink at 20px with a small hand-drawn arrow toward the field it refers to; the actual answer field is a normal Atkinson input.
- **Panel:** surface fill, 1px rule, 10px radius. Never a panel inside a panel.
- **Empty states:** one line-art illustration (ink, no fill), a Kalam caption, and one action naming its outcome ("Paste a job you're eyeing").
- Every component defines loading, empty, error, partial and long-content states.

## Do's and Don'ts

- Do: use the highlighter only behind verbatim proof.
- Do: pair every status colour with a symbol and a word.
- Do: name the outcome on buttons ("Tailor resume for this job", "Confirm 4 entries").
- Do: keep text fully readable before and without any animation.
- Do: show exact quotes from job postings in mono with the highlighter, pulled from stored data, never from model output.
- Don't: show scores, gauges, rings, percentages or "ATS score" anywhere.
- Don't: use red for "no evidence yet"; it is an empty box, not a failure.
- Don't: put playful styling, illustrations or colour into exported resumes.
- Don't: use yellow for buttons or promotion inside the app; it would dilute what yellow means. (Marketing: one yellow band and headline marker swipes are allowed.)
- Don't: use testimonials, star ratings, user counts or unverifiable stats on the landing page.
- Don't: change the mouse cursor anywhere (no `cursor` declarations; owner rule). Disabled controls show it through opacity and a reason, not the pointer.

## Motion

- **Approach:** intentional and minimal.
- **Easing:** enter ease-out, exit ease-in, move ease-in-out.
- **Duration:** micro 80ms, short 180ms, medium 300ms, long 500ms (rare).
- **The one authored moment:** the highlighter swipe. When a resume line or requirement is focused, the yellow mark draws left to right under its source fact (~200ms, ease-out) as the pair links.
- Secondary: the verdict seal "stamp press" (scale 1.06 to 1, 120ms) on first render of a new verdict.
- `prefers-reduced-motion`: both become instant state changes. Content is never hidden waiting for scroll or entrance animations.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-08 | Initial design system "Attested Notebook" | Created by /design-consultation from PRD v4/TRD v4 + CEO/eng amendments, saybriefly.com reference, category research (Kickresume, Rezi, Teal, Naukri), and independent voices (Codex: evidence notebook, Archivo; Claude subagent: stamps, verdict seal, counterfoil stub, Atkinson Hyperlegible). Memorable thing: "Every line is true, and I can see why." |
| 2026-10-08 | Preview skipped | AI mockups unavailable (no OpenAI key); user chose to skip the HTML preview. Tokens are approved Phase 3 values, not measured from a rendered mockup. |
| 2026-10-08 | Highlighter reserved for proof; CTAs are ink | Keeps the single most memorable device meaningful. |
| 2026-10-11 | Six ATS-safe resume templates with an in-editor gallery | Owner asked for the 5–6 templates people commonly recommend; grounded in 2026 guidance (single-column, reverse-chronological; hybrid for freshers/switchers). |
| 2026-10-10 | Landing expanded to explain the product: what it does (two products), why resumes fail (red-pen), how it works, features, who it's for (tabs), honest comparison (categories, no brands), signed promises, receipt, FAQ; sticky header with section links | Owner: "the website is too small, so he didn't understand what things we do". No fake testimonials: personas show example facts instead. |
| 2026-10-08 | Removed scroll-driven animation; story became a click-through stepper; hero rebuilt as a composed desk | Owner: "dont give scroll animate and make the main first visual section better". |
| 2026-10-08 | Landing overdrive: scroll-told Living Document + stampable hero desk (Motion 14) | Owner: "push the animation and overall design much further". Direction A chosen via /impeccable overdrive. |
| 2026-10-08 | Landing page made expressive ("two volumes") | Owner feedback: first build looked flat and uncreative next to the saybriefly.com reference. |
| 2026-10-08 | Stamps + verdict seal instead of badges/gauges | Category centres a score gauge; this product refuses numbers that judge the person. |
