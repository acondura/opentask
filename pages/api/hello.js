// Configure this API route to run on the Edge Runtime as required by Cloudflare Pages
export const runtime = 'edge'

export default function handler(req, res) {
  res.status(200).json({ message: 'Hello from Next API on Cloudflare Pages (Edge)!' })
}
