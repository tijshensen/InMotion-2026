import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Allow larger image + MP4 uploads in route handlers (default clone is 10 MB)
  experimental: {
    serverActions: {
      bodySizeLimit: "52mb",
    },
    middlewareClientMaxBodySize: "52mb",
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
