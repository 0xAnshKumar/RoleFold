import { Archivo, Kalam } from "next/font/google";

// shortcut: the v1 landing keeps its Archivo display + Kalam notes until it is rebuilt (DESIGN.md 6.8 step 2);
// loaded only on "/" so app routes never download them. Delete with the old landing.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-display" });
const kalam = Kalam({ subsets: ["latin"], weight: "400", variable: "--font-hand", preload: false });
export const landingV1Fonts = `${archivo.variable} ${kalam.variable}`;
