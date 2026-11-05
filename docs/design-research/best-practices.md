# Hunt: design best practices (research, Nov 2026)

Scope: motion, navigation, resume-builder and job-board UX, India device/network constraints, design-system structure.
Read with `docs/DESIGN.md`. That file is the authority; this doc proposes how to apply it. Where research conflicts with DESIGN.md, it is flagged **[conflict]** and DESIGN.md wins until the owner decides.
craft.do is being torn down separately; it is not covered here.

Owner rules this doc respects:
- No scroll-linked, pinned, scrubbed or scroll-jacked animation. Motion is load/entrance, hover/press, state change, view/page transition, real-DOM product visuals and micro-interactions. In-view reveals are allowed only as a very light, one-time fade.
- No scores, gauges or percentages that judge the person.
- No frosted glass, no cursor changes, highlighter yellow only behind proof.
- `prefers-reduced-motion` always honoured.

---

## 1. Motion

### What the best sites do (2025-2026)
- **Short and quiet in the product, expressive only on marketing.** UI animations should usually stay under 300ms, use ease-out for feedback, and **not animate keyboard-driven actions** that repeat many times a day. Raycast is cited as having almost none for this reason ([Emil Kowalski, "Great animations"](https://emilkowal.ski/ui/great-animations)). Linear and Vercel are usually described as "fast and confident": short durations and a clean ease-out (secondhand: [skills summary](https://playbooks.com/skills/dylantarre/animation-principles/slow-in-out-mastery)). Linear's 2024 redesign post talks about density, alignment and LCH colour, not motion ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)). The polish comes from restraint more than from animation.
- **Animate only where it carries information:** state changes, things entering or leaving, cause and effect ([Kowalski](https://emilkowal.ski/ui/great-animations)).
- **Interruptible.** User input must be able to cancel or redirect any animation. CSS transitions can retarget mid-flight; CSS keyframes cannot ([Kowalski](https://emilkowal.ski/ui/great-animations); [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines)).
- **Prefer CSS first, then the Web Animations API, then a JS library** ([Vercel guidelines](https://vercel.com/design/guidelines)). Motion's JS-driven animations can drop frames when the main thread is busy ([Kowalski](https://emilkowal.ski/ui/great-animations)). That matters on a busy mid-range Android phone.
- **No autoplay** except muted, non-essential loops. Anything that moves for more than 5s next to other content needs pause, stop or hide controls ([Vercel](https://vercel.com/design/guidelines); this is WCAG 2.2.2).
- **Stripe-style "morphing" dropdown.** One background panel resizes and moves between menu panels instead of each panel fading on its own ([Codyhouse breakdown](https://codyhouse.co/gem/stripe-navigation); [CSS-Tricks FLIP version](https://css-tricks.com/?p=272368)). Use it only if the marketing nav grows real dropdowns (see 2).

### Hunt motion tokens (extend DESIGN.md; only `--ease-out` exists in `src/app/globals.css` today)

| Token | Value | Use |
|---|---|---|
| `--dur-micro` | 80ms | press, toggle, checkbox, stamp ink-in |
| `--dur-short` | 180ms | hover, tooltip, highlighter swipe (DESIGN.md says ~200), menu open |
| `--dur-medium` | 300ms | sheet/dialog enter, route crossfade, step change in "How it works" |
| `--dur-long` | 500ms | rare: hero desk beats only; mobile bottom sheet |
| `--ease-out` | `cubic-bezier(0.2, 0.7, 0.2, 1)` (keep) or `cubic-bezier(0.23, 1, 0.32, 1)` for snappier enters | anything entering, all feedback |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | exits (exit duration ≈ 80% of the enter duration) |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | on-screen movement (A to B) |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | bottom sheets and side sheets (iOS-like) |
| spring `stamp` | `{ type: "spring", visualDuration: 0.18, bounce: 0.3 }` | verdict seal press, CONFIRMED stamp |
| spring `ui` | `{ type: "spring", visualDuration: 0.25, bounce: 0 }` | layout shifts, reordering, sheet drag release |

Sources for the curves and ranges: per-element ranges (press 100-160ms, tooltip 125-200ms, dropdown 150-250ms, modal/drawer 200-500ms) and curves `0.23,1,0.32,1` / `0.32,0.72,0,1` come from Kowalski-derived guides ([summary](https://agent-skills.md/skills/pproenca/dot-skills/emilkowal-animations), secondhand). The Material 3 standard curve `cubic-bezier(0.2, 0, 0, 1)` is a safe alternative "standard" ease ([M3 token mirror](https://docs.rs/frust-material/0.6.2/src/frust_material/tokens/motion.rs.html)). Motion's springs: `bounce` 0 = no overshoot, default 0.25; `visualDuration` lets springs line up with tween timings ([motion.dev transitions](https://motion.dev/docs/react-transitions)).

**Spring or tween?** Use springs for things the user moves directly or that should feel physical (stamps, drags, reorders, sheets). They also retarget smoothly when interrupted. Use tweens with tokens for opacity, colour and anything that must line up with CSS. Opacity and colour should never bounce.

### Hunt motion map (what moves, and how)

| Moment | Motion | Reduced motion |
|---|---|---|
| Landing hero desk (once, ~3s) | time-based sequence, each beat ≤300ms, total ≤3s; text is in the DOM and readable from frame 0 | static end state |
| Highlighter swipe | `clip-path: inset(0 100% 0 0)` → `inset(0)` or `scaleX` 0→1 from the left, 180-200ms ease-out | instant |
| Verdict seal / stamp press | scale 1.06→1 + opacity, 120ms, or spring `stamp` | instant |
| Button press | translateY(2px) + offset shadow removed, 80ms (already in DESIGN.md) | keep; it is feedback, not motion |
| Route change (app) | 150-200ms opacity crossfade of the main pane only; nav and sidebar stay still | none |
| Job card → job check | optional shared-element title morph via View Transitions (see below) | crossfade only |
| Confirm-facts queue | confirmed item: stamp ink-in 80ms, then the row collapses with height via `grid-template-rows: 1fr→0fr` 200ms; next item gets focus | instant remove, focus moves |
| Sheets/dialogs | enter translateY(16px→0)+fade 300ms `--ease-drawer`; exit 200ms ease-in | fade only |
| Toasts | enter 180ms, exit 150ms; polite `aria-live` | fade |
| In-view reveal (landing only, optional) | opacity 0→1 plus translateY 8px max, 300ms, once, threshold 0.2; **content must not be hidden if JS fails** | none |
| Keyboard actions (⌘K, j/k in feed, Enter to confirm) | **no animation** | none |

### View transitions in Next.js 16
- React's `<ViewTransition>` (import from `react`) with Next's `experimental.viewTransition: true` animates App Router navigations automatically. Next's docs (16.2.x) still call it **experimental, not recommended for production** ([Next.js docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition); [guide](https://nextjs.org/docs/app/guides/view-transitions)). One community report says the flag changed in 16.3 ([discussion #97925](https://github.com/vercel/next.js/discussions/97925)). Check against 16.4.5 before using it.
- Same-document View Transitions became Baseline when Firefox 144 shipped (Oct 2025) ([web.dev](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)), so there is a real cross-browser floor.
- **Recommendation:** treat it as progressive enhancement for two transitions only: feed card → job check (title and company morph) and resume list → editor. Keep each ≤250ms. Everything still works with no transition. Do not put `<ViewTransition>` around large DOM areas on low-end phones: snapshotting big areas is expensive.

### Reduced motion
- Wrap the app in `<MotionConfig reducedMotion="user">`. That turns off **transform and layout** animations on `motion` components; opacity and colour still animate ([motion.dev accessibility](https://motion.dev/docs/react-accessibility)). Anything else (autoplay loops, the hero sequence) needs `useReducedMotion()` by hand. The code already uses it in `HeroDesk`, `Story`, `WhoFor`, `Receipt` and `Onboarding`.
- CSS: one global `@media (prefers-reduced-motion: reduce)` block that sets `--dur-*` to `0.01ms` (not `0`, so `transitionend` still fires), plus the per-component end states.

### Performance rules
- Animate only `transform`, `opacity`, `clip-path` and `filter`. Never `width`, `height`, `top`, `left`, `margin` or `padding` ([Vercel](https://vercel.com/design/guidelines); [motion.dev performance](https://motion.dev/docs/performance)). For height collapse, use the `grid-template-rows` trick or Motion `layout` on a few nodes only.
- Never `transition: all`; list the properties ([Vercel](https://vercel.com/design/guidelines)).
- `will-change: transform` only right before an animation, and remove it after. Don't spread it around ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)).
- Motion animating CSS variables is not hardware-accelerated; animate `transform` directly ([motion.dev performance](https://motion.dev/docs/performance)).
- **Bundle:** the `motion` component is ~43kb. `m` + `LazyMotion` starts at ~5kb, plus `domAnimation` (+24kb) loaded lazily; `useAnimate` mini is 3.3kb ([motion.dev bundle size](https://motion.dev/docs/react-reduce-bundle-size)). Hunt imports full `motion` in 5 files. Switch the app routes to `m` + `LazyMotion` (or plain CSS), and keep full `motion` only on the landing chunk.
- SVG line art: transform `<g>` wrappers with `transform-box: fill-box; transform-origin: center` ([Vercel](https://vercel.com/design/guidelines)).
- Looping demos: a muted `<video autoplay loop playsinline>` (or a CSS loop) beats GIFs ([Vercel](https://vercel.com/design/guidelines)). Don't autoplay video on Save-Data (see 4).

---

## 2. Navigation

### Marketing header (landing)
- **Height:** 64px desktop, 56px phone. Sticky. NN/g: keep sticky headers as small as possible while readable, and use them only if they truly help ([NN/g sticky headers](https://www.nngroup.com/articles/sticky-headers/)).
- **Background: opaque paper, not glass.** NN/g says sticky headers must be an opaque colour distinct from the content. **[conflict]** `src/components/Nav.module.css` uses `backdrop-filter: blur(10px) saturate(1.2)`; DESIGN.md says "no frosted glass". Recommend `background: var(--paper)` plus a 1px `--rule` bottom border that appears after 8px of scroll (a class toggled by IntersectionObserver on a sentinel, not a scroll listener). That keeps the paper look and costs nothing on low-end GPUs, where `backdrop-filter` is expensive.
- **Shrink on scroll:** skip it. NN/g: animate the header minimally, ideally not at all; if it must shrink, make it immediate and never startling. Shrinking also changes layout, which breaks the transform-only rule. The 1px rule appearing at 180ms is the only change.
- **Hide on scroll down / show on scroll up:** phone only, if at all. Show again after a few pixels of upward scroll, sliding in over ~300ms ([NN/g](https://www.nngroup.com/articles/sticky-headers/)). Low priority.
- **Content:** wordmark · 4-5 section links (What it does, How it works, Who it's for, FAQ) · "Sign in" (text link) · one ink primary button ("Build my resume"). No mega menu: Hunt has two products, not twenty. If it ever grows, use the **disclosure pattern** (a button with `aria-expanded` that controls a panel of plain links), **not** `role="menu"`/`menubar`, which is for app menus ([Open UI navigation explainer](https://open-ui.org/components/navigation-bar.explainer); [Deque](https://www.deque.com/axe-con/wp-content/uploads/2023/01/SA_Accessible-MM_Final-1.pdf)).
- **Phone menu:** a full-height sheet from the top or right, `--ease-drawer` 300ms, focus trapped, Esc and backdrop tap close it, focus returns to the trigger, `overscroll-behavior: contain` ([Vercel](https://vercel.com/design/guidelines)).
- **Section links:** set `scroll-margin-top: 72px` on target headings so the sticky header doesn't cover them ([Vercel](https://vercel.com/design/guidelines)). Use native smooth scroll only when `prefers-reduced-motion: no-preference`.

### App shell
- **Desktop (≥1024):** a 56px top bar (wordmark, "Jobs", "Resumes", "Profile", account menu) **or** a 220-240px left rail. With only 4-5 destinations, a top bar is enough and leaves the editor's 5/7 split wide.
- **Phone (<600):** a bottom tab bar, 56px plus `env(safe-area-inset-bottom)`, with 4 tabs: Jobs · Resumes · Profile · More. Icon plus label (labels are never icon-only). The DESIGN.md "bottom action bar" for primary actions sits **above** the tabs on task screens, or replaces them while a task is in progress (confirm queue, editor).
- **Active state:** ink text plus a 2px ink underline (top bar) or a 2px ink bar above the icon plus bold label (tabs; no pills per DESIGN.md). No yellow.
- **⌘K command menu:** useful later for power users (jump to a job, a resume, "Tailor for…"), but **not a launch need**. Most users are on phones without a keyboard. If built: a combobox with focus kept in the input, `aria-activedescendant` on the active option, Esc closes it and focus returns to the trigger ([combobox guidance](https://opensource.ebay.com/evo-web/components/combobox/accessibility)). Use `cmdk` or a native `<dialog>`, no animation on open (keyboard-initiated).

### Navigation accessibility checklist
- `<header>` > `<nav aria-label="Main">`. The current page gets `aria-current="page"`.
- A "Skip to content" link is the first focusable element ([Vercel](https://vercel.com/design/guidelines)).
- **WCAG 2.4.11 Focus Not Obscured (AA):** the sticky header and bottom bars must never fully cover a focused element. Use `scroll-padding-top: 72px` / `scroll-padding-bottom: 72px` on `html` ([W3C, what's new in 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)).
- **WCAG 2.5.8 Target Size (AA):** 24×24 CSS px minimum; Hunt standard is **44×44 on touch** ([W3C](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/); [Vercel](https://vercel.com/design/guidelines)).
- Links are real `<a>`/`<Link>` so Ctrl+Click and middle-click work ([Vercel](https://vercel.com/design/guidelines)).

---

## 3. Resume builder and job board UX

### What the category gets wrong (user complaints)
- **Naukri:** irrelevant recommendations even with an accurate profile; spam calls and emails; fake recruiters asking for money; paid plans that don't produce calls ([G2 Naukri reviews](https://g2.com/products/naukri-com/reviews?page=10); [Trustpilot](https://www.trustpilot.com/review/naukri.com); [Business Today](https://businesstoday.in/latest/trends/story/linkedin-naukri-nothing-short-of-horror-frustrated-job-seeker-on-how-job-platforms-in-2025-are-sucking-soul-460167-2025-01-09)). Naukri itself has to publish "genuine recruiters never ask for money" ([Naukri FAQ](https://www.naukri.com/faq/job-seeker-search-do-i-need-to-pay-to-apply-to-a-job-or-get-an-interview-call%3F-/-recruiters-are-asking-me-to-pay-to-schedule-interview-for-job%3F)). Fake postings are a growing problem in India ([Mint via Magzter](https://www.magzter.com/hi/stories/newspaper/Mint-Ahmedabad/FAKE-JOB-POSTINGS-ARE-BECOMING-A-REAL-PROBLEM)).
- **Ghosting:** 73% of Indian respondents in a 2024 survey were ghosted by employers ([Business Today](https://www.businesstoday.in/latest/trends/story/no-e-mail-no-call-just-ghosted-jobseekers-post-on-hiring-managers-hits-home-internet-backs-him-up-496954-2025-10-06)).
- **Resume builders:** "free" builders that charge at download; unclear subscriptions; hard to cancel ([resumecoach on Teal](https://www.resumecoach.com/reviews/tealhq-resume-builder-review/); [jobshinobi paywall guide](https://jobshinobi.com/blog/how-to-spot-paywalls-in-free-resume-builders)). ATS "scores" are oversold: mostly keyword counts that don't predict real ATS parsing ([Scoutify on Rezi](https://scoutify.com/blog/rezi-review/)). Imports pull in more than users want and need manual checking of dates and skills ([Enhancv on Rezi](https://enhancv.com/blog/rezi-review/)). Several of these reviews come from competitors; treat them as directional.
- **Job cards:** users miss salary, posting date, location and industry on cards ([Simplify case study](https://allisonhuang.squarespace.com/simplify)). After searching, people filter first by **location, salary and freshness** ([quant UX study](https://aki-2.gitbook.io/quant-ux-blogpost-jokajobs/results-and-analysis)).
- **India-specific fields:** experience as a range ("1-6 Yrs"), salary often "Not disclosed", notice period, current and expected CTC, last-active date ([Naukri scraper schema](https://apify.com/mlg14/naukri-scraper); [Naukri guide](https://resumevera.com/guides/naukri-profile-optimization)).

These complaints are Hunt's positioning: verified sources, a reason for every match, no fake score, no paywall surprise.

### Patterns to adopt

**Onboarding: upload first, one decision per screen**
1. Landing CTA → sign-in (Google one-tap plus email OTP; no password) → **Upload** is the first screen. Accept PDF/DOCX, drag-and-drop **and** a large "Choose file" button (≥48px). On Android, the file picker is the main path; drag-and-drop is a desktop extra. Add a secondary "No resume? Start from questions" link.
2. While parsing (5-30s): a **step list that names each stage** ("Reading your file… Finding roles… Finding dates…"), with a percent-done or "3 of 5" count past 10s ([NN/g progress indicators](https://www.nngroup.com/articles/progress-indicators/): no indicator under 1s, a looped indicator for 2-10s, percent-done for 10s or more). Never a bare spinner over 10s.
3. **Confirm facts = a queue, not a form.** Group by section (Roles → Education → Skills → Achievements). Show one card at a time on phones and a list with a sticky "Confirm N entries" bar on desktop. Each card shows the source line in mono with the highlighter (proof), with Edit, Confirm and Not mine. Confirm-all is allowed only per section, after the user has scrolled the section. A progress count ("12 of 31 confirmed") is fine because it counts tasks, not the person.
4. → Master resume preview → template pick (6 thumbnails, recommended one first, with the reason "Campus: for freshers") → Export. **Export is free and visible from the first moment.** Say that on the upload screen.

**Progressive disclosure** ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/))
- Show the 3-5 things needed now; put the rest behind one clear "More" or a second step. Two levels at most.
- Editor: section list → tap a section → statements. Rewrite options appear on focus, not all at once.
- Job check: the verdict seal plus 2-3 reasons first; Eligibility, Requirements, Goal fit and Questions as collapsible sections (open by default on desktop, the first open on phones).

**Jobs feed**
- **Card (phone, ~120-140px tall):** title (heading 17-18px, 2 lines max) · company · location · work mode · experience range · salary or "Salary not shown" · posted age ("3 days ago") · source ("via company site") · **one plain reason line** ("Uses Python and SQL, which you confirmed"). One action: "Check fit". Save is an icon button with a label for screen readers.
- **No score, no % match, no stars.** At most one stamp (✓ MATCH / ◐ PARTIAL) next to the reason, per DESIGN.md.
- **Density:** desktop list is two columns (list 5 cols, preview 7 cols, the LinkedIn Jobs pattern) at ≥1024; phone is a single column that opens a full page.
- **Filters:** a top row of 4-5 chips on phones (Location · Work mode · Experience · Salary · Posted), "All filters" opens a bottom sheet, and an applied-count badge. Desktop gets the same chips, no left sidebar. **Filters live in the URL** ([Vercel](https://vercel.com/design/guidelines)). Results update on Apply in the sheet, live on desktop chips. The default sort is "Best fit to your confirmed skills" with "Newest" as the alternative.
- **Trust markers:** source and verified-company line on every card; a "Report this job" link on the job page; a banner in the apply flow saying no genuine employer asks for money.
- **Pagination:** "Load more" button (keeps scroll and footer reachable, works offline-ish), not infinite scroll. Restore scroll on Back ([Vercel](https://vercel.com/design/guidelines)).

**Empty, loading and error states**
- Skeletons that **match the final layout exactly** (no layout shift) for the feed, the job check and the profile ([Vercel](https://vercel.com/design/guidelines); [NN/g skeleton screens](https://nngroup.com/articles/skeleton-screens/)). No skeleton or spinner when the load takes under 1s. Delay spinners ~150-300ms and keep them visible at least ~300-500ms to avoid flicker ([Vercel](https://vercel.com/design/guidelines)). Skeleton shimmer is a static `--rule` block; use a slow 1.5s opacity pulse at most, and none under reduced motion or Save-Data.
- Empty states: line art, a Kalam caption and one outcome-named action (DESIGN.md). Feed empty: "No good matches today. Add a skill or widen location." with both actions.
- Errors next to the field, and focus the first error on submit ([Vercel](https://vercel.com/design/guidelines)). Network errors: "You're offline. Your edits are saved on this phone." plus Retry. No dead ends.
- Loading buttons keep their label and add a spinner ("Exporting…") ([Vercel](https://vercel.com/design/guidelines)).

**Forms (phone)**
- Inputs ≥16px font (prevents iOS zoom), correct `type`/`inputmode`/`autocomplete`, `touch-action: manipulation`, never block paste, no pre-disabled submit, warn before leaving with unsaved changes ([Vercel](https://vercel.com/design/guidelines)).
- Indian phone input: a fixed +91 prefix, `inputmode="tel"`, 10 digits. Salary: lakh/crore aware ("₹6.5 LPA"), stored as a number.

---

## 4. India: accessibility and low-end devices

### The device and network floor
- Android is ~90% of India and MediaTek chips ~47% (Q2 2025); sub-$100 phones were 16% of shipments and growing ([Counterpoint via Beebom](https://gadgets.beebom.com/news/indian-smartphone-market-q2-2025-counterpoint-report); [Android share](https://telecomlive.in/web/?p=976028)). Design for a ~₹10-15k Android with 4GB RAM and Chrome.
- Average speeds are high but uneven: overall download Jio 107 Mbps, Airtel 58, Vi 25, BSNL 4-9 (Oct-Dec 2025) ([Opensignal Feb 2026](https://insights.opensignal.com/reports/2026/02/india/mobile-network-experience)). The **tail** (Vi/BSNL users, congested evenings, small towns, indoor coverage) is where Hunt's users live. Test at "Slow 4G" (≈1.6 Mbps, 150ms RTT) with 4× CPU throttling.
- Budget guidance: ~150KiB of HTML/CSS/fonts and ~300-350KiB of JS (gzipped) at P75 devices and networks; mobile JS payloads have doubled since 2015 ([Alex Russell, performance inequality gap](https://infrequently.org/2022/12/); [2026 edition summary](https://conffab.com/elsewhere/the-performance-inequality-gap-2026-infrequently-noted/)).

### Hunt budgets (proposed, enforce in CI)
| Route | JS (gzip, route total) | CSS | Fonts | LCP target (Slow 4G, 4× CPU) |
|---|---|---|---|---|
| Landing | ≤170KB | ≤30KB | ≤90KB (2 woff2 preloaded) | ≤2.5s |
| Upload / confirm | ≤150KB | ≤25KB | shared | ≤2.5s |
| Jobs feed | ≤150KB | ≤25KB | shared | ≤2.5s; INP ≤200ms |
| Editor (desktop-heavy) | ≤250KB, preview lazy | ≤35KB | + mono | ≤3s |

Core Web Vitals "good" is LCP ≤2.5s, INP ≤200ms and CLS ≤0.1 at P75 ([web.dev thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)).
How: Server Components by default; `motion` → `m`+`LazyMotion` in the app; no animation library on the feed; `content-visibility: auto` on long lists ([Vercel](https://vercel.com/design/guidelines)); images with explicit size, lazy below the fold; POST/PATCH in under 500ms or optimistic with rollback.

### Fonts
- Use `next/font/google` (self-hosted, auto `size-adjust` fallback, no third-party request), WOFF2, Latin subset, `display: swap`. Preload only Archivo 800 and Atkinson 400 on the landing page (DESIGN.md already says this). Kalam and JetBrains Mono load on demand.
- **Variable Archivo with a width axis is heavy.** Subset the axes you use (wdth 70-112, wght 700-800) or ship two static instances. Check the woff2 size; aim for ≤45KB each.
- **Hindi/Indic:** Atkinson Hyperlegible Next covers ~150 languages, all Latin-based as far as found; no Devanagari support was found ([Adobe Fonts](https://fonts.adobe.com/fonts/atkinson-hyperlegible-next)). Add **Noto Sans Devanagari** (variable, split subsets on [Fontsource](https://fontsource.org/fonts/noto-sans-devanagari/cdn)) as a fallback with `unicode-range: U+0900-097F, U+1CD0-1CFF, U+200C-200D, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF`. It only downloads when Devanagari text appears (names, colleges, user-entered Hindi). Kalam already has Devanagari.
- Devanagari text needs more room: line-height ~1.7 vs 1.5 for Latin, no negative letter-spacing (it breaks the shirorekha), body one step larger ([Devanagari web typography](https://www.websnp.com/help/nepali-unicode-fonts-website-typography); rule of thumb). Use `:lang(hi)` overrides. Never uppercase or condense Indic text: stamps are Latin-only.
- The ₹ sign (U+20B9) must be in every subset you ship.
- Language: 57% of Apna users preferred a regional language for job search, Hindi first, then Kannada and Tamil ([Business Standard, 2021](https://business-standard.com/amp/article/companies/57-indians-prefer-using-regional-languages-for-job-search-apna-com-study-121120101216_1.html)). Hindi-medium (34%) and regional-medium (26%) job seekers feel less interview-ready than English-medium (44%) ([Apna 2025 via Business Today](https://www.businesstoday.in/amp/education/exams/story/only-3-in-10-indians-feel-ready-confident-for-job-interviews-freshers-hit-hardest-report-477396-2025-05-22)). Resumes stay English (the employer's language), but **UI copy in Hindi is a real lever**. Build copy as keys from day one; strings in Hindi run ~20-30% longer, so no fixed-width buttons.

### Data saver and slow networks
- Read the `Save-Data: on` request header on the server (more reliable than JS) and `navigator.connection.saveData` / `effectiveType` on the client ([web.dev Save-Data](https://web.dev/articles/optimizing-content-efficiency-save-data)). `prefers-reduced-data` has not shipped; don't rely on it.
- When Save-Data is on or `effectiveType` is `2g`/`slow-2g`: no hero autoplay (show the end state), no video, no decorative line art beyond inline SVG, no prefetching of other routes, and skip Kalam (fall back to the body font).
- Make uploads resumable or at least retryable, keep the user's place, and show "Saved on this device" for drafts.

### Accessibility floor (WCAG 2.2 AA)
- Contrast: DESIGN.md's measured pairs already pass (ink/paper 11.7:1, muted 5.7:1). Keep `--rule` (1.4:1) decorative only. Test the highlighter in direct sunlight: ink on yellow is 9.9:1, which is fine.
- Targets 44×44 on touch; focus visible (2px ink, 2px offset) and never hidden by sticky bars; status is never colour alone (DESIGN.md stamps do this).
- Respect zoom (never `maximum-scale=1`), support text resize to 200%, and lay out in `rem`.
- Don't rely on hover: every hover hint (linked fact highlight) must also work on tap and focus.

---

## 5. Design system structure

### Token layers (W3C DTCG 2025.10 is now stable; [W3C](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/))
Keep tokens as CSS custom properties in `globals.css` (already done). Optionally mirror them in a `tokens.json` in DTCG format only if a second consumer appears (Figma, email). Not needed now.

1. **Primitive** (raw values): `--ink-900 #173A2A`, `--paper-50 #FAF7EF`, `--yellow-300 #FFE45C`…
2. **Semantic** (meaning, what components use): `--text`, `--text-muted`, `--surface`, `--paper`, `--rule`, `--border-strong`, `--primary`, `--proof` (highlighter), `--status-*`, `--focus`. The night theme only remaps this layer (already the pattern in `[data-theme="night"]`).
3. **Component** (only when needed): `--button-offset: 0 2px 0 var(--primary-hover)`, `--panel-radius: var(--r-lg)`.

| Category | Hunt tokens (from DESIGN.md unless marked new) |
|---|---|
| Colour | as DESIGN.md; add `--focus` and `--overlay: rgba(17,34,26,.4)` (new) |
| Type | `--font-display/body/mono/note`; sizes `--fs-label 0.8125rem`, `--fs-body 1rem`, `--fs-lead 1.125rem`, `--fs-h3 1.25rem`, `--fs-h2 1.5rem`, `--fs-h1 2rem`, `--fs-display clamp(2.25rem,1.4rem+3.4vw,4.5rem)`; line-heights `--lh-tight 1.2`, `--lh-body 1.55`, `--lh-indic 1.7` (new) |
| Space | 4/8/12/16/24/32/48/80 (exists) |
| Radius | 4/6/10 + seal (exists) |
| Elevation | `--shadow-press: 0 2px 0` (buttons), `--shadow-overlay: 0 6px 20px rgba(23,58,42,.12)` (menus/sheets), `--shadow-poster: 8px 8px 0` (marketing only) |
| Motion | `--dur-micro/short/medium/long`, `--ease-out/in/in-out/drawer` + 2 spring presets in a `motion.ts` (new, see 1) |
| Layout | `--header-h 64px` (56 phone), `--tabbar-h 56px`, `--content-max 1200px`, `--gutter 24px`, `--z-header 50`, `--z-sheet 60`, `--z-toast 70` (new) |

### Component inventory (by module and screen)

**Primitives (shared, in `src/components/ui.tsx` or split by file once >300 lines)**
Button (primary, secondary, ghost, icon; loading state) · Link · Input · Textarea · Select (native) · Checkbox · Radio group · Switch · Chip/filter chip · Stamp (6 statuses) · Verdict seal · Evidence mark · Counterfoil stub · Margin note · Panel · Disclosure/accordion · Tabs · Dialog (`<dialog>`) · Sheet (bottom on phone, side on desktop) · Toast + live region · Tooltip (tap-friendly) · Skeleton (shape-matched variants) · Empty state · Error state · Progress steps (named stages) · Count badge · Avatar/initials · Skip link · Visually-hidden.

**Shell:** MarketingHeader · AppTopBar (desktop) · BottomTabBar (phone) · BottomActionBar · PageHeader (exists) · AccountMenu (disclosure) · CommandMenu (later).

| Screen | Key components | Notes |
|---|---|---|
| **Landing** | MarketingHeader, HeroDesk (exists), Band (paper/ink/yellow/mint), Story stepper (exists), WhoFor tabs (exists), Comparison table, Promise list, Receipt (exists), FAQ (`<details>`), Footer wordmark | Time-based motion only; static end states; one CTA per band |
| **Upload** | Dropzone + file button, "start from questions" link, privacy note, ProgressSteps (named stages), parse-error recovery | Upload first; free export said up front |
| **Confirm facts** | Section stepper, FactCard (source line with evidence mark, Edit/Confirm/Not mine), ConfirmBar ("Confirm N entries"), MarginNote for guided questions, undo toast | One card at a time on phone; focus moves to the next card; per-section confirm-all |
| **Resume editor / preview** | SectionList, StatementRow + CounterfoilStub, BlockedEditNotice (reason), TemplateGallery (6), PreviewPane (lazy, Typst), ExportMenu (PDF/Word), version label (mono) | 5/7 split on desktop; phone: tabs "Edit / Preview"; stub collapses to a "source" tab |
| **Jobs feed** | FilterChips + FilterSheet, SortToggle, JobCard (reason line + one stamp), SavedToggle, LoadMore, Skeleton cards, Empty state, ReportJob | URL-synced filters; list/preview split ≥1024 |
| **Job check** | JobHeader (title, company, source, posted), VerdictSeal + 2-3 reasons, RequirementRow (quote in mono + highlighter, stamp, your fact), Eligibility, Questions, "What would close the gaps" side panel, Tailor CTA, Apply (external link with a scam warning) | Seal is the only circle; never a number |
| **Profile** | Fact list by section, fact freshness badge, Add fact, Languages, Goals (target roles, locations, CTC expectation, notice period: India fields) | Facts are the source of truth; edits show downstream effect |
| **Settings** | Account, Theme (paper/night), Language (English/हिन्दी), Data saver override, Email alerts, Export/delete my data (confirm + undo window) | Plain list, Panel groups, no nested panels |

### Process
- Every component ships five states: default, loading, empty, error and long-content (DESIGN.md already says this). Add a sixth: **Devanagari content**.
- One `/admin/kit` page (or Storybook-free route) that renders every component in every state, in both themes, at 360px and 1280px widths. It doubles as a QA target.

---

## Ranked do / don't

**Do**
1. Keep every screen readable and usable before JS and before any animation finishes. Text in the DOM from frame 0; static end states for reduced motion and Save-Data.
2. Ship fast on a ₹12k Android: route JS ≤150KB on the feed and upload pages, LCP ≤2.5s on Slow 4G, INP ≤200ms. Move app routes from `motion` to `m` + `LazyMotion` or CSS.
3. Upload first, then a confirm **queue**, then free export, said up front. Named-stage progress for parses over 2s; percent or "n of m" over 10s.
4. Give every job a source, an age, a location/mode, an experience range, a salary-or-"not shown" and **one plain reason line**. Filters for location, salary, posted date, work mode and experience, all in the URL.
5. Use one motion vocabulary: 80/180/300/500ms, ease-out to enter, ease-in to exit, springs only for physical things (stamp, sheet). Animate transform/opacity/clip-path only.
6. Make the sticky header opaque paper, 64/56px, with a hairline rule after scroll, and keep focused elements visible (`scroll-padding`).
7. Make touch targets 44px, inputs 16px+ font, and a bottom tab bar plus bottom action bar on phones.
8. Add Noto Sans Devanagari via `unicode-range`, `:lang(hi)` line-height 1.7, and make all UI strings translatable.
9. Use skeletons that match final layout; no loader under 1s; spinners delayed 150-300ms and held ≥300ms.
10. Show trust in the UI: "Report this job", a no-money warning at apply, and the verified source on every card.

**Don't**
1. Don't use scroll-linked, pinned, scrubbed or scroll-jacked motion, or parallax. In-view reveals: a one-time 300ms fade at most, never hiding content.
2. Don't show a match %, an "ATS score", stars or a gauge: the category's most criticised trick, and against DESIGN.md.
3. Don't use frosted-glass headers. (`Nav.module.css` currently has `backdrop-filter: blur(10px)`: **flag for owner**.) They are expensive on low-end GPUs and conflict with DESIGN.md.
4. Don't animate keyboard-initiated or high-frequency actions (⌘K, j/k, Enter-to-confirm, tab switches).
5. Don't use `transition: all`, animate width/height/top/left, or set permanent `will-change`.
6. Don't use infinite scroll on the feed, and don't hide the footer or lose scroll position on Back.
7. Don't add a mega menu or `role="menu"` site navigation. Two products need five links.
8. Don't hide pricing until export, and don't put a paywall behind "download".
9. Don't autoplay video or loops on Save-Data/2G, or any loop longer than 5s without a pause control.
10. Don't put View Transitions in the critical path: still experimental in Next 16. Use them only as enhancement on card→detail.
