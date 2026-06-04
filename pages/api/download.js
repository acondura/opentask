// Simple download endpoint that reads files from R2. Expects binding on globalThis.opentask (R2)
// and reads objects under key: <owner>:<projectId>:<taskId>:<filename>

export default async function handler(req) {
  // Edge-compatible base64url decode
  function base64UrlDecodeToJson(payload) {
    try {
      let str = payload.replace(/-/g, '+').replace(/_/g, '/')
      while (str.length % 4) str += '='
      const binary = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary')
      const json = decodeURIComponent(Array.prototype.map.call(binary, c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
      return JSON.parse(json)
    } catch (e) {
      return null
    }
  }

  function tryDecodeJwtForEmail(token) {
    try {
      const parts = token.split('.')
      if (parts.length < 2) return null
      const payload = parts[1]
      const obj = base64UrlDecodeToJson(payload)
      return obj?.email || obj?.user?.email || obj?.email_address || null
    } catch (e) {
      return null
    }
  }

  function getHeader(req, name) {
    if (!req.headers) return null
    if (typeof req.headers.get === 'function') {
      return req.headers.get(name)
    }
    return req.headers[name] || req.headers[name.toLowerCase()]
  }

  function ownerFromReq(req) {
    const candidates = [
      'cf-access-authenticated-user-email',
      'x-authenticated-user-email',
      'x-forwarded-user-email',
      'email',
      'x-user-email'
    ]
    for (const name of candidates) {
      const val = getHeader(req, name)
      if (val) return Array.isArray(val) ? val[0] : val
    }
    const jwtNames = ['cf-access-jwt-assertion', 'cf-access-jwt', 'x-forwarded-jwt', 'authorization']
    for (const name of jwtNames) {
      const jwt = getHeader(req, name)
      if (jwt) {
        const tok = Array.isArray(jwt) ? jwt[0] : jwt
        const maybe = tok.replace(/^Bearer\s+/i, '')
        const email = tryDecodeJwtForEmail(maybe)
        if (email) return email
      }
    }
    if (req.url) {
      try {
        const url = new URL(req.url, 'http://localhost')
        const ownerParam = url.searchParams.get('owner')
        if (ownerParam) return ownerParam
      } catch (e) { }
    }
    return null
  }

  const R2 = globalThis?.CLOUDFLARE_R2 || globalThis?.opentask || null
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'GET' } })
  }

  try {
    let projectId, taskId, filename
    if (req.url) {
      try {
        const url = new URL(req.url, 'http://localhost')
        projectId = url.searchParams.get('projectId')
        taskId = url.searchParams.get('taskId')
        filename = url.searchParams.get('filename')
      } catch (e) { }
    }

    if (!projectId || !filename) {
      return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (!R2 || !R2.get) {
      return new Response(JSON.stringify({ error: 'R2 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    const owner = ownerFromReq(req)
    const key = `${owner || 'public'}:${projectId}:${taskId || 'unassigned'}:${filename}`
    const obj = await R2.get(key)
    
    if (!obj) {
      return new Response('File Not Found', { status: 404 })
    }

    // Set standard headers
    const headers = new Headers()
    obj.writeHttpMetadata(headers)
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    
    const buffer = await obj.arrayBuffer()
    return new Response(buffer, {
      status: 200,
      headers
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const runtime = 'edge'
