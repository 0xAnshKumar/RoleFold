import s from "./Skeleton.module.css";

/**
 * Skeletons (DESIGN.md 3.17): same box sizes as the final layout. The region fades in only after 300ms, so fast
 * loads never flash it, and pulses at most 3 times. One sr-only message names what is loading.
 */
export function SkeletonRegion({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${s.region} ${className ?? ""}`} aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <div aria-hidden>{children}</div>
    </div>
  );
}

export function Skeleton({ width = "100%", height = 16, radius, className }: { width?: number | string; height?: number | string; radius?: string; className?: string }) {
  return <span className={`${s.block} ${className ?? ""}`} style={{ width, height, borderRadius: radius }} />;
}

/** Text lines: height = line height × 0.6, last line 60% wide. */
export function SkeletonText({ lines = 3, lineHeight = 24 }: { lines?: number; lineHeight?: number }) {
  return (
    <span className={s.text} style={{ "--lh": `${lineHeight}px` } as React.CSSProperties}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={s.line} style={{ width: i === lines - 1 && lines > 1 ? "60%" : undefined }} />
      ))}
    </span>
  );
}
