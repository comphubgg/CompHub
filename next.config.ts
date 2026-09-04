import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  webpack(config, { dev }) {
    if (dev) {
      if (!config.watchOptions) {
        config.watchOptions = {};
      }
      config.watchOptions.ignored = [
        /node_modules/,
        /\.git/,
        /\.next/,
        /\.vercel/,
        /\.venv/,
        /tmp/
      ];
    }
    return config;
  },
};

export default nextConfig;
