import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ['@relay/core'],
  typedRoutes: false,
  poweredByHeader: false,
};

export default nextConfig;
