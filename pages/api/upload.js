// Simple upload endpoint that writes files to R2. Expects binding on globalThis.opentask (R2) and
// will write objects under key: <owner>:<projectId>:<taskId>:<filename>

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

  // Use R2 binding name CLOUDFLARE_R2 (or fallbacks)
  const R2 = globalThis?.CLOUDFLARE_R2 || globalThis?.opentask || null
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'POST' } })
  }

  try {
    let body = {}
    try {
      if (typeof req.json === 'function') {
        body = await req.json()
      } else if (req.body) {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      }
    } catch (e) {}

    const {projectId, taskId, filename, contentBase64} = body
    if (!projectId || !filename || !contentBase64) {
      return new Response(JSON.stringify({error:'missing fields'}), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (!R2 || !R2.put) {
      return new Response(JSON.stringify({error:'R2 not bound'}), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    const owner = ownerFromReq(req)
    const key = `${owner || 'public'}:${projectId}:${taskId || 'unassigned'}:${filename}`
    const buffer = Buffer.from(contentBase64, 'base64')
    await R2.put(key, buffer)
    return new Response(JSON.stringify({ok:true, key}), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({error: String(e)}), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const runtime = 'edge'
