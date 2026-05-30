// Simple upload endpoint that writes files to R2. Expects binding on globalThis.opentask (R2) and
// will write objects under key: <projectId>:<taskId>:<filename>

export default async function handler(req, res) {
  // Use R2 binding name CLOUDFLARE_R2 (or fallbacks)
  const R2 = globalThis?.CLOUDFLARE_R2 || globalThis?.opentask || null
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed')
  try {
    const {projectId, taskId, filename, contentBase64} = req.body || {}
    if (!projectId || !filename || !contentBase64) return res.status(400).json({error:'missing fields'})
    if (!R2 || !R2.put) return res.status(500).json({error:'R2 not bound'})

    const key = `${projectId}:${taskId || 'unassigned'}:${filename}`
    const buffer = Buffer.from(contentBase64, 'base64')
    await R2.put(key, buffer)
    return res.status(200).json({ok:true, key})
  } catch (e) {
    return res.status(500).json({error: String(e)})
  }
}

export const runtime = 'edge'
