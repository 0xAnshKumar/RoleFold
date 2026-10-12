import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Browser calls go to /v1 on this origin and are proxied to the FastAPI service: no CORS.
  async rewrites() {
    return [{ source: "/v1/:path*", destination: `${process.env.API_URL ?? "http://127.0.0.1:8000"}/v1/:path*` }];
  },
};

export default nextConfig;
