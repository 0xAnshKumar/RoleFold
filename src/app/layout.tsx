import type { Metadata } from "next";
import { Archivo, Atkinson_Hyperlegible_Next, JetBrains_Mono, Kalam } from "next/font/google";
import "./globals.css";

const display = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display" });
const body = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-body", adjustFontFallback: false, fallback: ["system-ui", "sans-serif"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", preload: false });
const hand = Kalam({ subsets: ["latin"], weight: "400", variable: "--font-hand", preload: false });

export const metadata: Metadata = {
  title: { default: "Hunt — a resume where every line is true", template: "%s — Hunt" },
  description:
    "Build a free, ATS-safe resume from facts you confirm, and see honestly how any job fits you. No fake scores.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
