# craft.do teardown (study of technique, not identity)

Studied 2026-11-06 in Chrome: home (`/`), `/write`, `/imagine`. Read-only: no sign-up, no forms, no downloads. No cookie banner appeared.
Evidence came from computed styles, CSSOM walks, `document.getAnimations()`, rAF sampling, Performance API, and same-origin reads of the loaded JS chunks.

**Viewport caveat:** `resize_window` had no effect on this Chrome window, so every capture is 1470x786 CSS px (DPR 2), not 1440. The site sends `X-Frame-Options: DENY` / `frame-ancestors 'none'`, so a 390px iframe was not possible either. **The mobile notes (390) come from reading the CSS and markup, not from screenshots.**

Screenshots (in `docs/design-research/craft-shots/`):

| File | What it shows |
|---|---|
| `01-home-hero-desktop.jpg` | Hero: glass pill nav, serif H1, glass CTA, torn-paper collage, app screenshot |
| `02-home-categories.jpg` | "Not just one thing" row of five line icons |
| `03-home-people-marquee.jpg` | Auto-scrolling people/use-case carousel |
| `04-home-write-dom-mockup.jpg` | Feature card with **live DOM** app windows |
| `05-nav-mega-menu-open.jpg` | The nav pill growing into a mega menu, sibling links dimmed |
| `06-home-imagine-bento.jpg` | Integrations bento (green card, white tiles) |
| `07-home-plan-bento-live-date.jpg` | Planning bento. The calendar tile shows **today's real date** ("6 Nov, Friday") |
| `08-home-structure-cards.jpg` | Three-up cards with DOM mockups breaking out of the card edge |
| `09-home-themes-marquee.jpg` | Theme cards marquee over a torn-paper collage |
| `10-home-cta-footer.jpg` | Textured CTA band and the dark footer |
| `11-write-hero.jpg` | Product page hero: flat colour plus paper grain, one SVG scribble, pill sub-nav |
| `12-write-dom-doc-mockup.jpg` | DOM document mockup with a white gradient fade at the bottom |
| `13-imagine-hero-rotator.jpg` | `/imagine` hero: crossfading screenshots and floating app icons |

---

## 1. Navbar

**Structure.** `<header>` is `position: fixed`, `z-index: 50`, 52px tall, `border-radius: 26px` (a full pill). Width is `calc(100% - 96px)` with max 850px, and max 920px at `lg`. On mobile it is `calc(100% - 48px)`. There is a separate `navigation-width-wide-language` (max 950/1020px) for languages with longer labels.
- Left to right: wordmark, then Product (button), Imagine, Community (button), Pricing, Learn, Download, then Log in and a black pill CTA "Try Craft Free" (36px tall, `padding 8px 14px`, 16px/500).
- Nav links are 16px/400 with `transition: color .2s cubic-bezier(.4,0,.2,1)`.

**Glass recipe** (all custom Tailwind utilities):
- `background: linear-gradient(180deg, #fff6 10%, #fffc)`. The top is more transparent than the bottom, so the bar looks lit from above.
- `backdrop-filter: blur(4px)` at rest and **blur(12px) while a menu is open**, with `transition: backdrop-filter 100ms cubic-bezier(.4,0,.2,1)`.
- `glass-border-3xl::before`: a 1px hairline drawn as a gradient `linear-gradient(#ffffffa3 40%, #fff0 75%, #fff0 95%, #ffffffa3)`, masked to the border with `mask: linear-gradient(#fff 0 0) content-box exclude, linear-gradient(#fff 0 0)`. The rim catches light at the top and bottom and fades along the sides. **This is the single most "premium" detail on the page.**
- `glass-button-shadow`: `0 12px 12px 2px #0000001a, 0 2px 4px -1px #0000000f`. It is a wide, soft, low-contrast drop shadow, not an outline.

**Scroll behaviour (the only scroll-linked effect on desktop).** JS writes an inline `top` equal to `32px - scrollY`, clamped at 16px. Measured: y=0 gives 32px, y=5 gives 27px, y=10 gives 22px, y≥20 gives 16px. The bar just docks 16px higher within the first 16px of scroll. Height, width, blur and background do not change on scroll: **no shrink, no hide-on-scroll.**

**Mega menu.** It opens on hover and sets `aria-expanded="true"`. The pill itself **grows in place** to hold the panel; it is not a separate dropdown.
- Height goes from 52px to 288px (Product) or 184px (Community), as JS-driven inline height.
- Sampled per frame, the **open** reaches about 90% of its height in about 100ms, then settles over another 100-150ms (a spring or long ease-out tail). The **close** runs from 288px to 52px in about 180ms.
- During the open, the blur animates 4→12px. Inactive top-level links dim to `rgba(3,3,2,.35)` while the hovered one stays full black. Panel tiles fade in (`opacity` 0→1).
- Panel layout: 2x2 "big" tiles (icon, title, one-line description, white at roughly 50% on the glass) plus a column of four compact rows (What's New, Imagine, Help, Blog). See `05-nav-mega-menu-open.jpg`.

**Hover and press.**
- Text links change colour only (200ms).
- The black CTA goes `hover:bg-black-700` (200ms).
- The glass CTA has an inner `.glass-button-gradient-bg`: a `linear-gradient(180deg,#fff9,#ffffff96 25%,#fff9 50%,#ffffffd6 75%)` at `background-size: 300% 300%`. On hover, `background-position` moves from `50% 0` to `50% 70%` over 500ms, and the shadow lifts to `0 20px 25px 4px #0000001a, 0 10px 10px -5px #0000000a`.
- Focus is `focus-visible:ring-2 ring-white rounded-full`. Site-wide utilities include `active:scale-95`.

**Mobile menu.** Not seen live (see the caveat). From the markup: a `md:hidden` cluster holds a compact "Try Craft Free" (13px) and an icon-only button. The same 26px pill shrinks to `calc(100% - 48px)` wide, and the same dropdown is driven by Radix.

## 2. Animations (complete inventory for the three pages)

Libraries found by fingerprinting the loaded chunks (31 chunks, about 1.3 MB of JS decoded):

| Library | Evidence |
|---|---|
| **Next.js App Router** (RSC payloads, `/_next/static/chunks/app/[locale]/…`) | script URLs |
| **Tailwind CSS v4** (`--color-*` in oklch, `--tw-*`, `@layer`) plus **shadcn/ui** tokens (`--background`, `--card`, `--ring`, `--radius .625rem`) | CSS |
| **Radix UI** (accordion, nav menu: `--radix-accordion-content-height`, `data-[state=open]`) | 7 chunks |
| **Motion (framer-motion)** | chunk `948-…` (120 kB decoded): `layoutId`×18, `motionValue`×13, `stiffness`/`damping`, `whileInView` |
| **Embla Carousel** with the **AutoScroll** plugin | `embla__container`, `AutoScroll`, `pauseOnHover` |
| **Splide** with the **auto-scroll** extension | `splide__list`, "Start/Pause auto scroll" aria strings |
| Analytics: PostHog, Plausible, Cloudflare Insights | network |

**Not present:** GSAP/ScrollTrigger, Lottie, Rive, three.js/WebGL, `<canvas>`, `<video>`, Lenis or any smooth-scroll hijack, CSS `animation-timeline`/`view-timeline`, or AOS-style `data-animate`.

| # | Where | Trigger | Technique | Timing / easing | Reduced motion |
|---|---|---|---|---|---|
| 1 | Nav docks from top:32 to 16px | scroll, first 16px only | JS inline `top` | 1:1 with scroll, clamped | n/a (tiny) |
| 2 | Mega-menu pill grows or shrinks | hover | Motion height animation (JS inline `height`) plus CSS blur transition | open about 250ms, spring-like tail. Close about 180ms. Blur 100ms `cubic-bezier(.4,0,.2,1)` | the CSS part is killed. The JS part is unknown |
| 3 | Sibling-link dim in the nav | hover | CSS colour transition | 200ms `(.4,0,.2,1)` | killed by global rule |
| 4 | Glass button sheen | hover | CSS `background-position` on a 300% gradient, plus a shadow change | 500ms. The button itself is `transition-all 500ms cubic-bezier(0,0,.2,1)` | killed |
| 5 | People/use-case carousel (`03`) | **time** (autoplay, continuous) | Embla AutoScroll, `translate3d` on the container | about 20 px/s, linear. `pauseOnHover` present | unclear: no explicit reduced-motion check found in the Embla chunk |
| 6 | Theme cards marquee (`09`) | **time** | Splide auto-scroll, `translateX` | about 30 px/s | Splide core reads `(prefers-reduced-motion: reduce)` |
| 7 | Second Embla row | **time** | as #5, opposite direction | — | as #5 |
| 8 | Integration icons (`06`) | hover | `hover:scale-110 hover:shadow-lg`. On `md`, the other icons drop to `group-hover:opacity-20` (spotlight) | 150ms `(.4,0,.2,1)` | killed |
| 9 | "Start Building" chips | hover | `hover:scale-105` plus a darker bg plus `shadow-lg` | 150ms | killed |
| 10 | FAQ/accordion | click | Radix plus CSS keyframes `accordion-down/up` on `--radix-accordion-content-height`. Chevron rotates 200ms | Tailwind default | killed |
| 11 | Footer links | hover | 1px underline `w-0 → w-full` | 300ms ease-in-out | killed |
| 12 | Hero paper-texture overlay | state | `transition-[mask-image] 500ms` (a mask swap) | 500ms | killed |
| 13 | `/imagine` hero screenshot swap (`13`) | **time** (about every 2.5s) | **WAAPI via Motion**: out = opacity 1→0, `blur(0→10px)`, `translate(0,0 → ∓20px, 30px)`. In = the reverse. The second image is staggered **200ms** | 800ms `ease-out` | WAAPI is **not** affected by the CSS reduced-motion rule. Unknown whether `MotionConfig reducedMotion="user"` is set |
| 14 | `/imagine` rotating template name ("Dream Journal" to "Gift Planner") | **time** (about every 2.5s) | WAAPI: out = opacity 1→0, `translateY(-30px)`, `blur(5px)`. In = `scale(.95) translateY(10px)` to rest, `blur(5→0)` | **1000ms `cubic-bezier(.9,0,.1,1)`** (sharp ease-in-out) | as #13 |
| 15 | One mobile-only card (`md:hidden`, Write card) | scroll | Motion `useScroll` + `useTransform`, scale 0.9↔1 | scroll-linked | — |

**In-view fade-ins: none.** I took a full opacity, transform and inline-style snapshot of every `main` element, scrolled the whole page in 350-400px steps, then diffed. Home: **zero** elements changed apart from carousels and Next/Image blur placeholders being removed. `/write`: **zero**. The server-rendered HTML has only two `opacity:0` inline styles (closed menu panels). Every section is fully painted on arrival. Craft's motion budget goes to hover, menus, marquees and one rotating hero. Nothing is gated behind scroll.

**Hero load animation: none.** The home hero renders statically (clouds have `transform-gpu` but no animation and no pointer parallax; verified by moving the pointer and re-reading transforms).

**Global reduced-motion rule** (in their CSS):
```css
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior:auto!important; transition-duration:.01ms!important;
      animation-duration:.01ms!important; animation-iteration-count:1!important; }
  .splide__track { transition:none!important; }
}
```
This catches CSS but not JS/WAAPI loops (#5, #7, #13, #14). That gap is the weak spot.

**Easing vocabulary actually used:** `cubic-bezier(.4,0,.2,1)` (Tailwind in-out, the default everywhere), `cubic-bezier(0,0,.2,1)` (ease-out on buttons), `cubic-bezier(.215,.61,.355,1)` (easeOutCubic, on a few lists), `cubic-bezier(.9,0,.1,1)` (the text rotator), and Motion springs for the menu.
**Durations:** 100 / 150 / 200 / 300 / 500 / 800 / 1000 ms.

## 3. Images and visuals: how they are made

The hero is a **layered paper collage built in CSS, not one big image** (`01`):
1. A sky gradient `linear-gradient(in oklab, #9ED4EF, #D1EEF9)`, then a `from-transparent to-white` layer at 30% opacity.
2. **A tiling paper-grain WebP** (`paper-texture.webp`) at `mix-blend-mode: overlay; opacity: .5`. The same grain sits over every coloured card on the site (and `paper-texture-full.webp`, 288 kB decoded).
3. Cloud PNGs (600x309, `loading=lazy`, 27-width srcset) with a halftone dot pattern.
4. A giant outline of the wordmark drawn as a `mask-image: url(logo-outline.svg)` on a `bg-current` span (`text-black-300`), so it is a single colour you can tint.
5. **Torn-paper shapes are `<div>`s with SVG `mask-image`s** (`paperSheetMask.svg`, `paperShredBlobMask.svg`, `paperShredUfoMask.svg`, `paperShredTriangleFront/BackMask.svg`, `paperShredFlatBottomFront/BackMask.svg`). Each shape is filled with colour, pattern or the grain texture. Front/back mask pairs at `scale: .84`/`.92` give a fake paper thickness and edge. One sheet is tilted with `rotate-34 skew-x-6`. Fill images: `paper-black.png`, `paper-notebook.webp` (1552x1200), `papers-combined-lg.png`.
6. The **app screenshot** is a static image (`hero-screenshot-desktop-full-new`, served as AVIF), `loading=eager fetchpriority=high`, 45-entry srcset, a `<picture>` with a separate `(max-width:767px)` mobile crop (`sizes=316px`). It sits in a frame with `rounded-t-[16px] border-black/10 bg-white/80 backdrop-blur-md` and `filter: drop-shadow(0 25px … rgba(0,0,0,.15))`.

**Feature visuals are live DOM product UI** (`04`, `07`, `08`, `12`):
- The Todo window, "My Sourdough Bread" doc, calendar tile, tasks list, reminders, Spaces switcher and Collections table are real HTML text. The app's own type stack is used (`apple-system, InterFont`, 12-15-19px). The marketing type is Untitled Sans/Serif, so **the product reads as the product, and the marketing reads as the brand.**
- **The calendar tile renders the visitor's real current date** ("6 Nov / Today / Friday").
- Small SVG/PNG icons (150x150 SVG glyphs: Doc, Todo, Calendar, Scribble, Pencil) are dropped into the DOM mockups.
- Mockups bleed past card edges, which are cropped by `overflow-hidden`. Long content fades out with a `h-[180px] bg-gradient-to-b from-white/0 to-white` overlay rather than a hard cut.
- Theme cards and people portraits are raster images (PNG through `/_image`).

**Delivery.**
- Every raster goes through Cloudflare image resizing at `/_image/width=N,quality=85,format=auto/…`. **A `.png` URL actually returned `image/avif`** (50 kB), `cache-control: public, max-age=31536000, immutable`.
- Next/Image blur-up placeholders: inline `background-image` on the `<img>`, removed after load.
- Everything below the fold is `loading=lazy`. The home page has 201 `<img>` and 61 `<svg>` elements, and zero video, canvas, Lottie or Rive.
- `/write` hero: a flat `bg-purple-2` plus the same grain overlay plus **one inline SVG path** (an 1801px-wide scribble) as decoration.

## 4. Layout and type system

**Page frame.**
- `body` is `bg-beige` = **#FCF9F7** (warm off-white).
- The main wrapper is `p-4 lg:p-5`, `gap-[80px] lg:gap-[120px]` between top-level blocks.
- The hero is an **inset rounded panel** (`rounded-3xl` = 24px, 20px from the viewport edge, 723px tall at 786px viewport), not full-bleed. This one move makes the page feel like an object on a desk.

**Grid.**
- Content sections are **1080px** wide and centred. Larger feature cards are `2xl:max-w-[1240px]`. Tailwind containers run up to 80rem.
- Section padding is `py-12 lg:py-[60px]`, inner gaps `gap-12 / gap-[60px]`.
- **Rhythm:** 120px between blocks, 60px inside a block, 24-48px inside cards.
- Breakpoints: Tailwind 40/48/64/80/96rem, plus ad-hoc 375/390/400/424/425/445/480/500/550/700px rules for fine mobile tuning.

**Type.**
- Fonts: **Untitled Serif** (display, 400 only) and **Untitled Sans** (UI, 400/500) from Klim. The product mockups fall back to apple-system/Inter.
- 8 woff2 files are preloaded for latin, plus CJK/Korean/Japanese families (Noto Sans/Serif SC, IBM Plex Sans KR/JP, Hahmlet, Kaisei Opti), each with a metric-matched `… Fallback` `@font-face` on `local(Arial|Times New Roman)`. That removes CLS on font swap.
- Weights are restrained: **no bold anywhere**. Headings are serif 400, labels sans 500.
- **Negative tracking at every size:** about -3% on display, -2% on body.
- An italic serif word is used for emphasis inside headlines ("it's for *your* things", "*Imagine* the possibilities", "*Let's get started*").

| Role | Family | Size / line-height | Tracking | Weight |
|---|---|---|---|---|
| H1 | Untitled Serif | 66 / 66 (1.0) | -1.98px (-3%) | 400 |
| H2 section | Untitled Serif | 54 / 59.4 (1.1) | -1.08px (-2%) | 400 |
| H3 lead | Untitled Serif | 46 / 56 (1.22) | -1.38px (-3%) | 400 |
| H3 card | Untitled Serif | 36 / 44 | -1.08px | 400 |
| Quote/card line | Untitled Serif | 24 / 28.8 | -0.72px | 400 |
| Label | Untitled Sans | 16-18 / 1.4 | -0.32 / -0.36px | 500 |
| Body | Untitled Sans | 16 / 22.4 (1.4) | -0.32px | 400, colour `rgba(3,3,2,.75)` |
| Eyebrow | Untitled Sans | small caps-style uppercase ("WRITE", "IMAGINE") | wide | 500 |

**Colour.**
- Ink `--color-black-900: #030302` (a warm near-black), with alpha steps at 4% (`50`), 9% (`100`), 12% (`200`), 50% (`500`) and 75% for body text.
- Canvas `#FCF9F7`, cards `#fff`.
- Section colours are pastel blocks with grain: sky `#9ED4EF→#D1EEF9`, periwinkle (Write), mint (Imagine), butter yellow (Plan), plus peach `#FFDBC5` and mint chips `#9BD8A9`.
- All colours are in oklch/oklab. Gradients are interpolated `in oklab`, so there are no muddy midpoints.
- **Light only.** I found no dark-mode tokens on the marketing site. The footer is the only dark surface (near-black plus grain).

**Radii:** `--radius .625rem` (10px) for shadcn components, 12px tiles, 16px (`2xl`) frames, 24px (`3xl`) cards and hero, 32px (`4xl`) large cards on md+, and full pills for every button and the nav.

**Shadows.**
- `shadow-block`: `0 50px 40px rgba(0,0,0,.01), 0 50px 40px rgba(0,0,0,.02), 0 20px 40px rgba(0,0,0,.05), 0 3px 10px rgba(0,0,0,.08)`. Four layers, very low alpha, very long throw. It reads as ambient occlusion, not as a drop shadow.
- Also `drop-shadow-paper: drop-shadow(0 0 100px rgba(0,0,0,.05))`, and the glass shadows from section 1.

**Glass:** used only on the nav, the glass CTA and the screenshot frame (`backdrop-blur-md` = 12px). Never on content cards.

## 5. What makes it feel premium: 10 transferable techniques

1. **The page is an object, not a canvas.** The hero is an inset `rounded-3xl` panel 16-20px off the viewport edge on a warm `#FCF9F7`. Every major section is a rounded, softly shadowed card.
2. **Tactile material through one shared grain.** A single tiling paper-texture WebP at `mix-blend-mode: overlay; opacity: .5` sits on every coloured surface. It is cheap (one cached asset) and removes the "flat vector" look.
3. **Shapes from SVG masks over textures, not exported art.** Torn paper is `mask-image: url(shape.svg)` on a div filled with colour or pattern, with front/back masks offset by `scale` to fake depth. Shapes stay recolourable and tiny.
4. **Real-DOM product mockups** in the product's own UI font, cropped by the card and faded with a white gradient. They are crisp at any DPR and translatable, and they **render the visitor's real date**, which makes them feel alive without animation.
5. **Light-catching glass rim.** A 1px `::before` border painted with a vertical white-to-transparent-to-white gradient and cut out with `mask-composite: exclude`, on top of a top-to-bottom alpha gradient fill and `blur(4px)`. This is more convincing than `border: 1px solid rgba(255,255,255,.x)`.
6. **Four-layer ambient shadows** (`shadow-block`): alpha 1-8%, 3-50px offsets. Cards feel lifted with no visible shadow edge.
7. **Restrained type with negative tracking at every size.** A serif display at weight 400 only, a sans at 400/500, no bold, tracking -2% to -3%, line-height 1.0-1.1 on display, and one italic word for voice.
8. **A navigation container that morphs.** The pill grows into the mega menu, with roughly a 250ms spring on open and 180ms on close, blur rising from 4px to 12px, and inactive siblings dimmed to 35%. It is one continuous surface, not a popover.
9. **Small, consistent hover physics.** 150-200ms `cubic-bezier(.4,0,.2,1)` for colour, 500ms for the sheen. `scale(1.05-1.10)` plus a shadow step on chips and icons. Siblings drop to 20% opacity to spotlight the hovered item. Footer underlines grow from 0 to 100% in 300ms.
10. **Rotating hero with blur crossfades.** Items exit with `opacity→0 + blur(10px) + translate(±20px,30px)` and enter in reverse, 800ms ease-out with a 200ms stagger. The text uses 1000ms `cubic-bezier(.9,0,.1,1)` with a 5px blur. Adding blur to a crossfade hides the "two images overlapping" moment.

Also notable:
- Every section is fully visible on arrival (no in-view reveal). That is good for perceived speed and screenshots.
- Font fallbacks are metric-matched, giving **CLS 0.000** (measured).

## 6. Performance

Measured on a warm reload over the network (cache primed, so transfer sizes read 0; decoded sizes below):

| Metric | Value |
|---|---|
| TTFB | ~560-610 ms (Cloudflare) |
| FCP | 668 ms |
| LCP | 668 ms. The element is the **hero torn-paper sheet** (`paperSheetMask.svg` div, size 497k px²). The hero screenshot is `fetchpriority=high`, eager |
| DCL / load | 0.9-1.2 s / 1.3-1.5 s |
| CLS | **0** |
| HTML | 147 kB transferred, **923 kB decoded** (a heavy RSC payload, mostly i18n and page data) |
| JS | 31 chunks, about 1.3 MB decoded (React DOM ~196 kB, a framework chunk ~236 kB, Motion 120 kB, a lazy 170 kB chunk) |
| CSS | 6 sheets, 265 kB decoded (one 245 kB Tailwind sheet, site-wide) |
| Fonts | 8 woff2 preloaded, ~296 kB decoded |
| Images | 55+ via `/_image` → AVIF, ~1 MB decoded. 201 `<img>` on home, almost all `loading=lazy` with 24-45-entry srcsets |
| Requests | ~244 on the home page |

**How they avoid jank:**
- No scroll listeners driving layout (apart from the 16px nav dock).
- No scroll-reveal.
- Marquees use `translate3d` on one container.
- Torn-paper layers use `contain-layout contain-paint isolate`.
- Decorative images carry `transform-gpu`.
- Motion's WAAPI path runs opacity, filter and transform on the compositor.
- The nav `backdrop-filter` is only 4px at rest; 12px appears only while the menu is open.
- Weak spots: the 923 kB HTML, the 245 kB CSS, three carousel libraries (Embla, Splide, Motion), and JS loops that ignore reduced motion.

---

## What Hunt should borrow (technique) vs never copy (identity)

Context: Hunt's `docs/DESIGN.md` already sets an "attested notebook" identity: warm paper `#FAF7EF`, forest ink `#173A2A`, highlighter `#FFE45C`, stamps and seals, Archivo plus Atkinson Hyperlegible Next. Owner rules: **no scroll-linked, pinned or scrubbed animation and no scroll-jacking**, no cursor changes, no testimonials or user counts.
Craft confirms this direction works. Its premium feel comes from material, type and hover/menu polish, not from scroll choreography.

### Borrow (techniques, re-expressed in Hunt's language)

**Load / entrance**
- Do what Craft does: paint every section complete on arrival, with no in-view fade-ins. If Hunt wants one, cap it at a single 300ms opacity fade on first intersection, never with transform offsets, and content must be visible without JS. Craft uses **none**, so Hunt does not need any.
- Keep Hunt's one authored hero moment (the desk "writes itself", about 3s, once). Borrow Craft's **blur-plus-offset crossfade** for it: enter with `opacity 0→1, filter blur(8px→0), translateY(12px→0)`, 300-500ms ease-out, 120-200ms stagger. Give it a static end state under reduced motion.

**Hover / press** (DESIGN.md durations: 80/180/300ms)
- Colour changes 180ms `cubic-bezier(.4,0,.2,1)`.
- Chips and cards: `scale(1.02-1.04)` plus one shadow step, 180ms. Press: `scale(.97)` at 80ms.
- **Sibling spotlight:** when one item in a set is hovered, dim the others to about 40% (`:has(:hover) > :not(:hover)`). Good for the template picker and the job list.
- Footer and inline links: an underline that grows `width 0→100%` in 300ms. In Hunt it can be drawn as the **highlighter swipe**, which already exists.
- **No cursor changes** (owner rule). Craft uses `cursor-pointer`; Hunt must not.

**State and page transitions**
- **A nav container that morphs:** Hunt's top bar (or the app's job-detail tabs) can grow into its own panel. Animate height with a short spring (Motion `type:"spring", bounce:0, duration:.25`), close faster than it opens (180ms), and dim inactive siblings.
- Accordions with Radix plus a height keyframe on `--radix-accordion-content-height` (the same approach as Craft).
- Step pictures in "How it works" (already click-only): use the blur crossfade above (`opacity + blur(6px)`, 300ms) and press the stamps in afterwards.

**Real-DOM product visuals** (the biggest transferable win)
- Render the resume, fact cards and verdict as **real HTML using the app's own components and fonts**, cropped by the card, with a paper-coloured gradient fade at the bottom instead of a hard cut.
- **Use live data the way Craft uses today's date:** today's date on the job ticket, and the visitor's locale in the date format. Never invent user data.
- Let mockups bleed past card edges (`overflow-hidden` on the card, with the mockup offset).

**Material and type**
- **One shared grain texture** (`mix-blend-mode: overlay`, about 0.35-0.5 opacity) on coloured marketing surfaces only, never in the app.
- **SVG-mask shapes** for any decorative paper (ruled-notebook tabs, stamp outlines), filled with Hunt tokens. They stay recolourable and tiny.
- **Layered ambient shadow** for soft surfaces, with alpha at 8% or less. Note that Hunt's DESIGN.md calls for *hard offset* shadows on marketing cards, so keep those. Use the ambient recipe only for floating UI (menus, popovers, the nav).
- **Glass rim** (gradient `::before` plus `mask-composite: exclude`) is fine for the floating nav only, tinted toward Hunt's paper colour rather than white.
- Negative tracking on display type (-1.5% to -3%), display line-height 1.0-1.1, and no extra weights beyond what DESIGN.md defines.
- **Inset hero panel**: hero as a rounded card 16-20px off the viewport edge.

**Performance hygiene**
- Use metric-matched fallback `@font-face` (Next `next/font` does this). This is what gives Craft CLS 0.
- Serve images as AVIF via `format=auto` with immutable caching, keep `fetchpriority=high` on the single hero visual, and lazy-load everything else.
- One motion library (Hunt already uses Motion 14). Do not add Embla or Splide just for marquees.
- **Do better than Craft on reduced motion:** wrap the app in `<MotionConfig reducedMotion="user">` so JS/WAAPI animations also stop. A CSS `*{animation-duration:.01ms}` rule alone does not cover them.

### Never copy (Craft identity)

- The torn-paper collage, cloud/sky hero, halftone clouds, giant outlined wordmark behind the hero, and the paper-shred shapes (UFO, blob, triangle). These are Craft's signature. Hunt's paper metaphor is ruled notebook, ink, highlighter and stamps; it must stay recognisably different.
- Untitled Serif / Untitled Sans and the serif-400-headline-with-italic-word voice. Hunt uses Archivo plus Atkinson.
- Their pastel section palette (sky, periwinkle, mint, butter, peach) and the `#FCF9F7` / `#030302` pair.
- Their copy patterns ("Your space for…", "Let's get started", "Make it unmistakably yours"), their app-window chrome (traffic lights, "Joe's Space" sidebar) and the screenshot framing.
- **The testimonial/people marquee and integration-logo wall.** Hunt's DESIGN.md bans testimonials and user counts, and endless auto-scroll marquees are time-based motion the user did not ask for.
- The mobile-only `useScroll` scale card and the scroll-docking nav offset. Both are scroll-linked, which the owner has ruled out. Hunt's nav should be simply fixed or sticky with no scroll-driven change.
- Glass on content cards. Craft itself limits glass to the nav, buttons and the screenshot frame.
