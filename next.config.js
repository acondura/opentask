/**
 * Basic Next.js config suitable for Cloudflare Pages (Edge)
 * - sets output to 'standalone' for optimization
 * - enables experimental app directory compat if desired
 */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    appDir: false
  }
};

module.exports = nextConfig;
