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
  },
  trailingSlash: false,
};

export default nextConfig;
