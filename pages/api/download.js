// Simple download endpoint that reads files from R2. Expects binding on globalThis.opentask (R2)
// and reads objects under key: <projectId>:<taskId>:<filename>

export default async function handler(req, res) {
  const R2 = globalThis?.CLOUDFLARE_R2 || globalThis?.opentask || null
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed')

  try {
    const { projectId, taskId, filename } = req.query || {}
    if (!projectId || !filename) return res.status(400).json({ error: 'missing fields' })
    if (!R2 || !R2.get) return res.status(500).json({ error: 'R2 not bound' })

    const key = `${projectId}:${taskId || 'unassigned'}:${filename}`
    const obj = await R2.get(key)
    
    if (!obj) {
      return res.status(404).end('File Not Found')
    }

    // Set standard headers
    const headers = new Headers()
    obj.writeHttpMetadata(headers)
    headers.forEach((value, k) => {
      res.setHeader(k, value)
    })
    
    // Set attachment header for browser downloading
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    
    const buffer = Buffer.from(await obj.arrayBuffer())
    return res.status(200).send(buffer)
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
}

export const runtime = 'edge'
