import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["tldraw", "@tldraw/tlschema"],

  turbopack: {
    resolveAlias: {
      "zod/v4/locales/index.js": "./scripts/zod-locales-shim.js",
    },
  },
  experimental: {
    proxyClientMaxBodySize: "1gb",
  },
};

export default nextConfig;
