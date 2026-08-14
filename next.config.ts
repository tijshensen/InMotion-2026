import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Allow larger image uploads in route handlers (default is often too small)
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
    // Don't serve a stale RSC payload of an empty canvas after edits
    staleTimes: {
      dynamic: 0,
    },
  },
  trailingSlash: false,
  /**
   * Serve /uploads/* via API route that reads disk on each request.
   * Avoids next start static-file cache missing files written after boot
   * (new uploads + crops).
   */
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: "/api/uploads/:path*",
      },
    ];
  },
};

export default nextConfig;
