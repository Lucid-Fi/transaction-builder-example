import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the inspector truthful in dev: don't replay cached fetches on hot reload.
  experimental: {
    serverComponentsHmrCache: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
