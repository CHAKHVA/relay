import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: { turbopackRustReactCompiler: true },
  transpilePackages: ['@relay/core'],
  typedRoutes: false,
  poweredByHeader: false,
  agentRules: false,
};

export default nextConfig;
