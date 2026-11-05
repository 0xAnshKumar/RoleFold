import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Browser calls go to /v1 on this origin and are proxied to the FastAPI service: no CORS.
  async rewrites() {
    return [{ source: "/v1/:path*", destination: `${process.env.API_URL ?? "http://127.0.0.1:8000"}/v1/:path*` }];
  },
  // Nav v2 (DESIGN.md 6.7): Feed is the "For you" tab of Jobs; Skills insight lives in Profile. Temporary while the
  // redesign settles. Query strings (feed filters) carry over.
  async redirects() {
    return [
      { source: "/feed", destination: "/jobs", permanent: false },
      { source: "/skills", destination: "/profile#skills", permanent: false },
    ];
  },
  // Brand texture files are renamed on change, so they cache forever.
  async headers() {
    return [{ source: "/brand/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
};

export default nextConfig;
