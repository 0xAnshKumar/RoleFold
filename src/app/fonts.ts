import { Atkinson_Hyperlegible_Next, IBM_Plex_Mono, Newsreader, Noto_Sans_Devanagari } from "next/font/google";

// docs/DESIGN.md 2.2.2 / 6.4. Preloaded: Newsreader roman + Atkinson. Never preloaded: italic, mono, Devanagari.
// Newsreader with the opsz axis measured 129 KB (roman) / 144 KB (italic) against budgets of 60 / 50 KB, so per the
// spec's fallback it loads static weights instead (no optical sizing; display tracking is +0.005em to compensate).
export const display = Newsreader({ subsets: ["latin"], weight: ["400", "500"], style: ["normal"], variable: "--font-display", display: "swap" });
// Italic sets one word per headline and the signature line; the metric-matched fallback makes its swap nearly invisible.
export const displayItalic = Newsreader({ subsets: ["latin"], weight: ["400"], style: ["italic"], variable: "--font-display-italic", display: "swap", preload: false });
// Next has no fallback metrics for Atkinson Hyperlegible Next ("Failed to find font override values"), so the
// metric-matched fallback is declared by hand in globals.css ("Atkinson Fallback", computed from the woff2 with
// Next's own getFallbackMetricsFromFontFile).
export const ui = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-ui",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Atkinson Fallback", "system-ui", "sans-serif"],
});
export const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap", preload: false });
export const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-deva", display: "swap", preload: false });

export const fontVars = [display, displayItalic, ui, mono, deva].map((f) => f.variable).join(" ");
