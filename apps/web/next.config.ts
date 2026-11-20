import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  devIndicators: false,
  experimental: { useTypeScriptCli: false },
  async rewrites() {
    const api = process.env.BACKEND_URL ?? 'http://127.0.0.1:4000';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default config;
