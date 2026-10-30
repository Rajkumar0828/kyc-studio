import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides the Next.js route indicator (bottom-left) in dev; build errors still show.
  devIndicators: false,
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
