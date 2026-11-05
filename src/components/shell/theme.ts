"use client";

import { useEffect, useSyncExternalStore } from "react";

export type ThemePref = "light" | "night" | "system";
const KEY = "hunt-theme"; // read by the pre-paint script in src/app/layout.tsx; keep in step

const read = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "night" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("hunt-theme", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("hunt-theme", cb);
  };
};

function apply(pref: ThemePref) {
  const night = pref === "night" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (night) document.documentElement.setAttribute("data-theme", "night");
  else document.documentElement.removeAttribute("data-theme");
}

/** Theme setting (Light / Night / System, default Light). App only: the landing is always light. */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, read, () => "light" as ThemePref);
  // Also covers a client-side arrival from the landing, where the pre-paint script deliberately skipped night.
  useEffect(() => apply(pref), [pref]);
  const set = (p: ThemePref) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {}
    window.dispatchEvent(new Event("hunt-theme"));
  };
  return [pref, set] as const;
}
