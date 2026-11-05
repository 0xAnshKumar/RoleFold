import type { Metadata } from "next";
import { BootScript } from "./BootScript";
import { fontVars } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Hunt — a resume where every line is true", template: "%s — Hunt" },
  description:
    "Build a free, ATS-safe resume from facts you confirm, and see honestly how any job fits you. No fake scores.",
};

// Runs before first paint: the saved theme (Light / Night / System; the landing is always light) and Save-Data / 2G,
// which drops texture. Save-Data is read here rather than from the request header so every route can stay static.
const BOOT = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("hunt-theme");if(t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"night":"light";if(t==="night"&&location.pathname!=="/")d.setAttribute("data-theme","night")}catch(e){}var c=navigator.connection;if(c&&(c.saveData||/2g/.test(c.effectiveType)))d.classList.add("save-data")})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head>
        <BootScript html={BOOT} />
      </head>
      <body>{children}</body>
    </html>
  );
}
