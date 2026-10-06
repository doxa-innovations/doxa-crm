import { withDoxaWatch } from "@doxa-innovations/watch/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
  },
  async rewrites() {
    return [
      {
        source: "/api/auth/:path*",
        destination: "/api/auth/:path*",
      },
    ];
  },
};

// Doxa Watch: source maps for stack traces (browser maps are moved out of the public folder by
// `doxa-watch postbuild`) and the collector kept out of the server bundle.
export default withDoxaWatch(nextConfig);
