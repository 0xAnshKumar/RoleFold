import { Skeleton, SkeletonRegion, SkeletonText } from "@/components/ui/Skeleton";

/** Route loading state: a page-shaped skeleton (title + three cards), shown only if loading passes 300ms. */
export default function Loading() {
  return (
    <SkeletonRegion label="Loading this page">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 32 }}>
        <Skeleton width="40%" height={36} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="rim" style={{ borderRadius: "var(--r-lg)", background: "var(--surface)", padding: 20 }}>
            <SkeletonText lines={3} />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}
