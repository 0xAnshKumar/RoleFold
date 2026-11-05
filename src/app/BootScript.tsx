"use client";

/**
 * Inline <head> script that runs before first paint. Rendered as text/javascript on the server and text/plain on
 * the client, so React doesn't warn about rendering a script and the browser never runs it twice
 * (node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 */
export function BootScript({ html }: { html: string }) {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: html }} />;
}
