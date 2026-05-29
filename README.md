# Next.js on Cloudflare Pages (Edge) — Sample Scaffold

This repository is a minimal scaffold to run Next.js on Cloudflare Pages using the @cloudflare/next-on-pages adapter.

## Project description

A small starter project that demonstrates how to package and deploy a Next.js application to Cloudflare Pages (Edge) using the @cloudflare/next-on-pages adapter. It includes:

- A minimal Next.js app (pages/index.js) and a sample API route (pages/api/hello.js).
- Build scripts to create a production Next.js build (npm run build) and convert it into a Cloudflare Pages-compatible output (npm run pages:build) which writes to ./cloudflare-pages.
- A wrangler.toml with a basic build command and site bucket configured for Pages deployments.
- A .gitignore and simple next.config.js tuned for a standalone output.

Use this scaffold as a baseline to integrate Edge-friendly features, adjust routing, or extend with server-side functionality that runs on Cloudflare's edge network.

Quick start

1. Install dependencies:

   npm install

2. Run dev server (local Next.js):

   npm run dev

3. Build for production and adapt for Cloudflare Pages:

   npm run build
   npm run pages:build

   The pages build output will be in ./cloudflare-pages

4. Deploy with Wrangler (or Cloudflare Pages):

   npx wrangler pages deploy ./cloudflare-pages

Notes

- This scaffold is intentionally minimal. Adjust next.config.js, wrangler.toml and other files for your project needs.
- The @cloudflare/next-on-pages adapter requires a compatible Next.js version; check the adapter docs for details.
