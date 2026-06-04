// Simple API route to proxy saves/loads to Cloudflare KV.
// This endpoint expects to run on an environment that binds CLOUDFLARE_KV to a KV namespace.

export default async function handler(req) {
  // Bindings: In Cloudflare Pages/Workers, bind your KV namespace to the name CLOUDFLARE_KV
  // In Next-on-Pages or local dev, process.env.CLOUDFLARE_KV may hold a JSON string with methods mocked.
  // Prefer the binding name 'opentask' if you bound KV to that variable in Pages.
  const KV = globalThis?.CLOUDFLARE_KV || globalThis?.opentask || process.env.CLOUDFLARE_KV

  // Edge-compatible base64url decode
  function base64UrlDecodeToJson(payload) {
    try {
      let str = payload.replace(/-/g, '+').replace(/_/g, '/')
      while (str.length % 4) str += '='
      // atob -> binary string; decode percent-encoding to get UTF-8
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
    // try JWT headers
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
    // fallback to query param for local testing
    if (req.url) {
      try {
        const url = new URL(req.url, 'http://localhost')
        const ownerParam = url.searchParams.get('owner')
        if (ownerParam) return ownerParam
      } catch (e) { }
    }
    return null
  }

  const owner = ownerFromReq(req)
  // We'll store every task under keys like: <owner>:project:<projectId>:task:<taskId>
  const PREFIX = (owner ? `${owner}:project:` : 'public:project:')

  if (req.method === 'GET') {
    try {
      if (KV && KV.list) {
        // list all project:task keys for this owner
        const listRes = await KV.list({ prefix: PREFIX })
        const keys = listRes.keys.map(k => k.name)
        const values = await Promise.all(keys.map(k => KV.get(k)))
        // parse values (expecting JSON per-task with {id, name, parentId, projectId, childrenIds})
        const tasks = []
        for (let i = 0; i < keys.length; i++) {
          try {
            const v = values[i]
            const parsed = v ? JSON.parse(v) : null
            if (parsed) tasks.push(parsed)
          } catch (e) { }
        }

        // group by project and assemble trees
        const projectsMap = {}
        for (const t of tasks) {
          const pid = t.projectId || 'default'
          projectsMap[pid] = projectsMap[pid] || { id: pid, title: pid, tasks: [] }
          projectsMap[pid]._tasks = projectsMap[pid]._tasks || {}
          projectsMap[pid]._tasks[t.id] = { ...t, children: [] }
        }

        // link children by parentId
        for (const pid of Object.keys(projectsMap)) {
          const map = projectsMap[pid]._tasks
          for (const id of Object.keys(map)) {
            const node = map[id]
            if (node.parentId) {
              const parent = map[node.parentId]
              if (parent) parent.children.push(node)
            }
          }
          // collect top-level tasks
          const top = []
          for (const id of Object.keys(map)) {
            if (!map[id].parentId) top.push(map[id])
          }
          projectsMap[pid].tasks = top
          // cleanup helper
          delete projectsMap[pid]._tasks
        }

        const projects = Object.values(projectsMap)
        return new Response(JSON.stringify(projects), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify(null), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  if (req.method === 'POST') {
    try {
      let body = {}
      try {
        if (typeof req.json === 'function') {
          body = await req.json()
        } else if (req.body) {
          body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
        }
      } catch (err) {}
      const data = body.data || null
      // If client posts full projects array (data), we'll upsert per-task keys and remove stale keys
      if (Array.isArray(data) && KV && KV.put && KV.list && KV.get && KV.delete) {
        const desiredKeys = new Set()
        // collect tasks
        for (const proj of data) {
          const projectId = proj.id || proj.title || 'default'
          function walk(task, parentId = null) {
            const key = `${PREFIX}${projectId}:task:${task.id}`
            desiredKeys.add(key)
            const { children, ...rest } = task
            const value = {
              ...rest,
              id: task.id,
              name: task.name || task.title || '',
              parentId,
              projectId,
              childrenIds: (children || []).map(c => c.id)
            }
            // store
            KV.put(key, JSON.stringify(value))
            ; (children || []).forEach(child => walk(child, task.id))
          }
          ; (proj.tasks || []).forEach(t => walk(t, null))
        }

        // remove stale keys
        const existing = await KV.list({ prefix: PREFIX })
        const deletes = []
        for (const k of existing.keys) {
          if (!desiredKeys.has(k.name)) deletes.push(KV.delete(k.name))
        }
        await Promise.all(deletes)
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      // fallback: single-task upsert
      if (data && data.id && data.projectId && KV && KV.put) {
        const key = `${PREFIX}${data.projectId}:task:${data.id}`
        await KV.put(key, JSON.stringify(data))
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ ok: false, reason: 'KV not bound or invalid payload' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  if (req.method === 'DELETE') {
    try {
      let body = {}
      try {
        if (typeof req.json === 'function') {
          body = await req.json()
        } else if (req.body) {
          body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
        }
      } catch (err) {}
      const { projectId, id } = body
      if (!projectId || !id) {
        return new Response(JSON.stringify({ error: 'Missing projectId or id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      if (KV && KV.delete) {
        const key = `${PREFIX}${projectId}:task:${id}`
        await KV.delete(key)
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ ok: false, reason: 'KV not bound' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }

  return new Response('Method Not Allowed', {
    status: 405,
    headers: { 'Allow': 'GET,POST,DELETE' }
  })
}

// Ensure this API route is deployed to the Edge runtime so Cloudflare bindings and headers are available.
export const runtime = 'edge'
