import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || '.next',
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd()),
  allowedDevOrigins: ['127.0.0.1'],
  typescript: {
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH?.trim() || 'tsconfig.json',
  },
};

export default nextConfig;
