// Simple upload endpoint that writes files to R2. Expects binding on globalThis.opentask (R2) and
// will write objects under key: <owner>:<projectId>:<taskId>:<filename>

export default async function handler(req) {
  let KV = globalThis?.CLOUDFLARE_KV || globalThis?.opentask || process.env.CLOUDFLARE_KV
  let R2 = globalThis?.CLOUDFLARE_R2 || globalThis?.opentask || null

  // Local development fallback to in-memory KV store if binding is missing
  if (!KV) {
    globalThis.__localMockStore = globalThis.__localMockStore || {}
    KV = {
      get: async (key) => globalThis.__localMockStore[key] || null,
      put: async (key, val) => { globalThis.__localMockStore[key] = String(val) },
      delete: async (key) => { delete globalThis.__localMockStore[key] },
      list: async (options) => {
        const prefix = options?.prefix || ''
        const keys = Object.keys(globalThis.__localMockStore)
          .filter(k => k.startsWith(prefix))
          .map(k => ({ name: k }))
        return { keys }
      }
    }
  }

  // Local development fallback to in-memory R2 store if binding is missing
  if (!R2) {
    globalThis.__localMockR2 = globalThis.__localMockR2 || {}
    R2 = {
      get: async (key) => {
        const item = globalThis.__localMockR2[key]
        if (!item) return null
        return {
          arrayBuffer: async () => item.buffer,
          writeHttpMetadata: (headers) => {
            headers.set('Content-Type', item.contentType || 'application/octet-stream')
          }
        }
      },
      put: async (key, buffer, options) => {
        globalThis.__localMockR2[key] = {
          buffer: buffer,
          contentType: options?.customMetadata?.contentType || 'application/octet-stream'
        }
      }
    }
  }

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

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'POST' } })
  }

  const requesterEmail = ownerFromReq(req)
  if (!requesterEmail) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
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

    const { projectId, taskId, filename, contentBase64 } = body
    if (!projectId || !filename || !contentBase64) {
      return new Response(JSON.stringify({ error: 'missing fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (!R2 || !R2.put) {
      return new Response(JSON.stringify({ error: 'R2 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    // Resolve owner & permissions from KV project-meta
    let projectOwner = requesterEmail
    if (KV && KV.get) {
      const metaVal = await KV.get(`project-meta:${projectId}`)
      if (metaVal) {
        const meta = JSON.parse(metaVal)
        projectOwner = meta.owner

        // Check if requester has write access
        const role = meta.owner === requesterEmail ? 'owner' : (meta.collaborators?.[requesterEmail] || null)
        if (!role || role === 'viewer') {
          return new Response(JSON.stringify({ error: 'Forbidden: View-only access' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
        }
      }
    }

    const key = `${projectOwner}:${projectId}:${taskId || 'unassigned'}:${filename}`
    const buffer = Buffer.from(contentBase64, 'base64')
    await R2.put(key, buffer)
    return new Response(JSON.stringify({ ok: true, key }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}

export const runtime = 'edge'
