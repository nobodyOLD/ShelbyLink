import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use webpack for build to support Aptos SDK externals configuration
  // until Turbopack fully supports custom externals or SDK supports edge/server envs better


  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        "utf-8-validate": "commonjs utf-8-validate",
        "bufferutil": "commonjs bufferutil",
      });
    }
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        got: false,
      };
    }
    return config;
  },
};

export default nextConfig;
