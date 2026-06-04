// Simple API route to proxy saves/loads to Cloudflare KV.
// This endpoint expects to run on an environment that binds CLOUDFLARE_KV to a KV namespace.

export default async function handler(req) {
  let KV = globalThis?.CLOUDFLARE_KV || globalThis?.opentask || process.env.CLOUDFLARE_KV

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

  const requesterEmail = ownerFromReq(req)
  if (!requesterEmail) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  // Get user shares helper
  async function getShares(email) {
    if (!KV || !KV.get) return []
    const val = await KV.get(`shares:${email}`)
    return val ? JSON.parse(val) : []
  }

  // Save user shares helper
  async function saveShares(email, shares) {
    if (!KV || !KV.put) return
    await KV.put(`shares:${email}`, JSON.stringify(shares))
  }

  if (req.method === 'GET') {
    try {
      if (KV && KV.list && KV.get) {
        const projectsMap = {}

        // 1. Fetch owned projects index
        const ownedIndexPrefix = `${requesterEmail}:project-index:`
        const ownedIndexRes = await KV.list({ prefix: ownedIndexPrefix })
        const ownedProjectIds = ownedIndexRes.keys.map(k => k.name.replace(ownedIndexPrefix, ''))

        // Fetch meta and tasks for owned projects
        for (const pid of ownedProjectIds) {
          let meta = null
          const metaVal = await KV.get(`project-meta:${pid}`)
          if (metaVal) {
            meta = JSON.parse(metaVal)
          } else {
            // Auto-migration for existing projects without metadata
            meta = {
              id: pid,
              title: pid, // fallback to id
              owner: requesterEmail,
              collaborators: {}
            }
            await KV.put(`project-meta:${pid}`, JSON.stringify(meta))
          }

          // List and fetch all tasks for this project
          const taskPrefix = `${requesterEmail}:project:${pid}:task:`
          const taskListRes = await KV.list({ prefix: taskPrefix })
          const taskKeys = taskListRes.keys.map(k => k.name)
          const taskVals = await Promise.all(taskKeys.map(k => KV.get(k)))
          const tasks = taskVals.map(v => v ? JSON.parse(v) : null).filter(Boolean)

          projectsMap[pid] = {
            id: pid,
            title: meta.title || pid,
            owner: requesterEmail,
            role: 'owner',
            collaborators: meta.collaborators || {},
            tasks: tasks
          }
        }

        // 2. Fetch shared projects index
        const shares = await getShares(requesterEmail)
        for (const share of shares) {
          const { owner: projectOwner, projectId: pid, role } = share
          const metaVal = await KV.get(`project-meta:${pid}`)
          if (!metaVal) continue // project deleted
          const meta = JSON.parse(metaVal)

          // Fetch tasks from owner's namespace
          const taskPrefix = `${projectOwner}:project:${pid}:task:`
          const taskListRes = await KV.list({ prefix: taskPrefix })
          const taskKeys = taskListRes.keys.map(k => k.name)
          const taskVals = await Promise.all(taskKeys.map(k => KV.get(k)))
          const tasks = taskVals.map(v => v ? JSON.parse(v) : null).filter(Boolean)

          projectsMap[pid] = {
            id: pid,
            title: meta.title || pid,
            owner: projectOwner,
            role: role,
            collaborators: meta.collaborators || {},
            tasks: tasks
          }
        }

        // 3. Assemble task trees for each project
        const finalProjects = []
        for (const pid of Object.keys(projectsMap)) {
          const proj = projectsMap[pid]
          const tasks = proj.tasks

          const taskNodeMap = {}
          for (const t of tasks) {
            taskNodeMap[t.id] = { ...t, children: [] }
          }

          for (const id of Object.keys(taskNodeMap)) {
            const node = taskNodeMap[id]
            if (node.parentId && taskNodeMap[node.parentId]) {
              taskNodeMap[node.parentId].children.push(node)
            }
          }

          const topLevelTasks = []
          for (const id of Object.keys(taskNodeMap)) {
            if (!taskNodeMap[id].parentId) {
              topLevelTasks.push(taskNodeMap[id])
            }
          }

          proj.tasks = topLevelTasks
          finalProjects.push(proj)
        }

        return new Response(JSON.stringify(finalProjects), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
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

      const { action, projectId, collaborators, data } = body

      // A. Collaborators management action
      if (action === 'update_collaborators') {
        if (!projectId || !collaborators) {
          return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
        }

        const metaVal = await KV.get(`project-meta:${projectId}`)
        if (!metaVal) {
          return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
        }
        const meta = JSON.parse(metaVal)

        // Verify if requester is owner or admin
        const requesterRole = meta.owner === requesterEmail ? 'owner' : (meta.collaborators?.[requesterEmail] || null)
        if (requesterRole !== 'owner' && requesterRole !== 'admin') {
          return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
        }

        const oldCollaborators = meta.collaborators || {}
        const newCollaborators = collaborators

        // Process removals
        for (const email of Object.keys(oldCollaborators)) {
          if (!newCollaborators[email]) {
            const collabShares = await getShares(email)
            const updatedShares = collabShares.filter(s => s.projectId !== projectId)
            await saveShares(email, updatedShares)
          }
        }

        // Process additions & updates
        for (const [email, role] of Object.entries(newCollaborators)) {
          const collabShares = await getShares(email)
          const cleanShares = collabShares.filter(s => s.projectId !== projectId)
          cleanShares.push({ owner: meta.owner, projectId, role })
          await saveShares(email, cleanShares)
        }

        // Save updated metadata
        meta.collaborators = newCollaborators
        await KV.put(`project-meta:${projectId}`, JSON.stringify(meta))

        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      // B. General project array save
      if (Array.isArray(data)) {
        if (!KV || !KV.put || !KV.list || !KV.delete) {
          return new Response(JSON.stringify({ error: 'KV methods unavailable' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
        }

        // Get existing projects index for this user
        const ownedIndexPrefix = `${requesterEmail}:project-index:`
        const ownedIndexRes = await KV.list({ prefix: ownedIndexPrefix })
        const existingProjectIds = ownedIndexRes.keys.map(k => k.name.replace(ownedIndexPrefix, ''))

        const desiredProjectIds = new Set(data.map(p => p.id))

        // Create new projects index/meta & upsert tasks
        for (const proj of data) {
          const pid = proj.id
          
          // Verify role permission: if it exists, only allow edit/save if role is owner, admin, or editor
          const metaVal = await KV.get(`project-meta:${pid}`)
          let meta = null
          if (metaVal) {
            meta = JSON.parse(metaVal)
            const requesterRole = meta.owner === requesterEmail ? 'owner' : (meta.collaborators?.[requesterEmail] || null)
            if (!requesterRole || requesterRole === 'viewer') {
              // Skip saving this project if unauthorized (just in case)
              continue
            }
          } else {
            // New project creation
            meta = {
              id: pid,
              title: proj.title,
              owner: requesterEmail,
              collaborators: {}
            }
            await KV.put(`project-meta:${pid}`, JSON.stringify(meta))
            await KV.put(`${requesterEmail}:project-index:${pid}`, JSON.stringify({ id: pid }))
          }

          // If title changed, update metadata
          if (meta.title !== proj.title) {
            meta.title = proj.title
            await KV.put(`project-meta:${pid}`, JSON.stringify(meta))
          }

          const projectOwner = meta.owner
          const desiredTaskKeys = new Set()

          // Walk tasks and write under the owner's namespace
          async function walk(task, parentId = null) {
            const key = `${projectOwner}:project:${pid}:task:${task.id}`
            desiredTaskKeys.add(key)
            const { children, ...rest } = task
            const value = {
              ...rest,
              id: task.id,
              name: task.name || task.title || '',
              parentId,
              projectId: pid,
              childrenIds: (children || []).map(c => c.id)
            }
            await KV.put(key, JSON.stringify(value))
            if (children && children.length) {
              for (const child of children) {
                await walk(child, task.id)
              }
            }
          }

          if (proj.tasks && proj.tasks.length) {
            for (const t of proj.tasks) {
              await walk(t, null)
            }
          }

          // Delete tasks that were removed from this project (under projectOwner prefix)
          const projectTaskPrefix = `${projectOwner}:project:${pid}:task:`
          const existingTasksRes = await KV.list({ prefix: projectTaskPrefix })
          for (const k of existingTasksRes.keys) {
            if (!desiredTaskKeys.has(k.name)) {
              await KV.delete(k.name)
            }
          }
        }

        // Handle deletion of projects owned by this user
        for (const pid of existingProjectIds) {
          if (!desiredProjectIds.has(pid)) {
            // 1. Delete all tasks under owner's project namespace
            const projectTaskPrefix = `${requesterEmail}:project:${pid}:task:`
            const taskListRes = await KV.list({ prefix: projectTaskPrefix })
            for (const k of taskListRes.keys) {
              await KV.delete(k.name)
            }

            // 2. Remove project shares from all collaborators
            const metaVal = await KV.get(`project-meta:${pid}`)
            if (metaVal) {
              const meta = JSON.parse(metaVal)
              const collabs = Object.keys(meta.collaborators || {})
              for (const email of collabs) {
                const collabShares = await getShares(email)
                const updatedShares = collabShares.filter(s => s.projectId !== pid)
                await saveShares(email, updatedShares)
              }
            }

            // 3. Delete metadata & index key
            await KV.delete(`project-meta:${pid}`)
            await KV.delete(`${requesterEmail}:project-index:${pid}`)
          }
        }

        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      // C. Single task upsert
      if (data && data.id && data.projectId) {
        const pid = data.projectId
        const metaVal = await KV.get(`project-meta:${pid}`)
        if (!metaVal) {
          return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
        }
        const meta = JSON.parse(metaVal)
        const requesterRole = meta.owner === requesterEmail ? 'owner' : (meta.collaborators?.[requesterEmail] || null)

        if (!requesterRole || requesterRole === 'viewer') {
          return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
        }

        // Save under project owner's namespace
        const key = `${meta.owner}:project:${pid}:task:${data.id}`
        await KV.put(key, JSON.stringify(data))
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ ok: false, reason: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
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

      const metaVal = await KV.get(`project-meta:${projectId}`)
      if (!metaVal) {
        return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      }
      const meta = JSON.parse(metaVal)
      const requesterRole = meta.owner === requesterEmail ? 'owner' : (meta.collaborators?.[requesterEmail] || null)

      // Only owner and admin can delete tasks
      if (requesterRole !== 'owner' && requesterRole !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
      }

      if (KV && KV.delete) {
        const key = `${meta.owner}:project:${projectId}:task:${id}`
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
