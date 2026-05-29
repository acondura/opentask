import Head from 'next/head'
import {useEffect, useState, useRef} from 'react'

// Minimal in-browser persistence key
const STORAGE_KEY = 'opentask.v1'

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch(e){}
}

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null } catch(e){ return null }
}

async function loadFromKV() {
  try {
    const res = await fetch('/api/kv')
    if (!res.ok) return null
    const data = await res.json()
    return data
  } catch(e) { return null }
}

async function saveToKV(state) {
  try {
    await fetch('/api/kv', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({data: state})})
  } catch(e){}
}

export default function Dashboard() {
  const [projects, setProjects] = useState([])
  const [title, setTitle] = useState('')

  // drag state
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)

  useEffect(()=>{
    async function init() {
      const saved = loadState()
      if (saved) setProjects(saved)
      // try to fetch from KV and merge/overwrite if exists
      const kv = await loadFromKV()
      if (kv && Array.isArray(kv) && kv.length) {
        setProjects(kv)
        saveState(kv)
      }
    }
    init()
  }, [])

  useEffect(()=>{ saveState(projects) }, [projects])
  useEffect(()=>{
    // whenever projects change, try to also save to KV (best-effort)
    // include owner query param when running locally for testing: ?owner=email@example.com
    saveToKV(projects)
  }, [projects])

  function addProject() {
    if (!title.trim()) return
    setProjects(p=>{
      const next = [{id: uid(), title: title.trim(), tasks: []}, ...p]
      saveState(next)
      saveToKV(next)
      return next
    })
    setTitle('')
  }

  function addTask(projectId, parentId=null) {
    const name = prompt('Task name')
    if (!name) return
    setProjects(prev=>{
      const cp = JSON.parse(JSON.stringify(prev))
      const proj = cp.find(x=>x.id===projectId)
      const newTask = {id: uid(), name, children: []}
      if (!parentId) {
        proj.tasks.unshift(newTask)
      } else {
        const parent = findTaskById(proj.tasks, parentId)
        parent.children.unshift(newTask)
      }
      saveState(cp)
      saveToKV(cp)
      return cp
    })
  }

  function findTaskById(tasks, id) {
    for (const t of tasks) {
      if (t.id===id) return t
      const found = findTaskById(t.children||[], id)
      if (found) return found
    }
    return null
  }

  // Remove task
  function removeTask(projectId, taskId) {
    setProjects(prev=>{
      const cp = JSON.parse(JSON.stringify(prev))
      const proj = cp.find(x=>x.id===projectId)
      proj.tasks = removeById(proj.tasks, taskId)
      saveState(cp)
      saveToKV(cp)
      return cp
    })
  }

  function removeById(list, id) {
    return list.filter(x=>x.id!==id).map(x=>({ ...x, children: removeById(x.children||[], id)}))
  }

  // Drag handlers for tasks (supports hierarchical drop)
  function onDragStart(e, projectId, taskId) {
    dragItem.current = {projectId, taskId}
    e.dataTransfer.setData('text/plain', JSON.stringify(dragItem.current))
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e, projectId, overTaskId=null) {
    e.preventDefault()
    // compute drop position relative to target element (before/after/inside)
    let position = 'inside'
    try {
      const target = e.currentTarget
      const rect = target.getBoundingClientRect()
      const rel = (e.clientY - rect.top) / rect.height
      if (rel <= 0.25) position = 'before'
      else if (rel >= 0.75) position = 'after'
      else position = 'inside'
    } catch(e) {
      position = 'inside'
    }
    dragOverItem.current = {projectId, overTaskId, position}
  }

  function onDrop(e, projectId, overTaskId=null) {
    e.preventDefault()
    const src = dragItem.current
    const dest = dragOverItem.current || {projectId, overTaskId, position: overTaskId? 'inside' : 'start'}
    if (!src) return
    if (src.projectId !== dest.projectId) return

    setProjects(prev=>{
      const cp = JSON.parse(JSON.stringify(prev))
      const proj = cp.find(x=>x.id===src.projectId)
      // remove task from tree
      const [newTasks, removed] = removeTaskById(proj.tasks, src.taskId)
      proj.tasks = newTasks
      if (!removed) return cp
      // insert task according to dest
      proj.tasks = insertTaskAt(proj.tasks, dest.overTaskId, dest.position, removed)
      // persist after reorder
      saveState(cp)
      saveToKV(cp)
      return cp
    })

    dragItem.current = null
    dragOverItem.current = null
  }

  function removeTaskById(list, id) {
    for (let i=0;i<list.length;i++){
      if (list[i].id === id) {
        const removed = list[i]
        const newList = [...list.slice(0,i), ...list.slice(i+1)]
        return [newList, removed]
      }
      if (list[i].children && list[i].children.length) {
        const [newChildren, removed] = removeTaskById(list[i].children, id)
        if (removed) {
          const newItem = {...list[i], children: newChildren}
          const newList = [...list.slice(0,i), newItem, ...list.slice(i+1)]
          return [newList, removed]
        }
      }
    }
    return [list, null]
  }

  function insertTaskAt(list, targetId, position, task) {
    if (!targetId) {
      // drop into project area: position 'start' or 'end' -> default to start
      if (position === 'after') return [ ...list, task ]
      return [ task, ...list ]
    }
    for (let i=0;i<list.length;i++){
      if (list[i].id === targetId) {
        if (position === 'inside') {
          const children = list[i].children ? [task, ...list[i].children] : [task]
          const newItem = {...list[i], children}
          return [...list.slice(0,i), newItem, ...list.slice(i+1)]
        }
        if (position === 'before') {
          return [...list.slice(0,i), task, ...list.slice(i)]
        }
        // after
        return [...list.slice(0,i+1), task, ...list.slice(i+1)]
      }
      if (list[i].children && list[i].children.length) {
        const newChildren = insertTaskAt(list[i].children, targetId, position, task)
        // if insertion happened (detect by reference change)
        if (newChildren !== list[i].children) {
          const newItem = {...list[i], children: newChildren}
          return [...list.slice(0,i), newItem, ...list.slice(i+1)]
        }
      }
    }
    return list
  }

  function renderTasks(projectId, tasks, depth=0) {
    return (
      <ul style={{listStyle:'none', paddingLeft: depth?16:0}}>
        {tasks.map(t=> (
          <li key={t.id} style={{border:'1px solid #ddd', padding:8, marginBottom:8, background:'#fff'}} draggable
              onDragStart={(e)=>onDragStart(e, projectId, t.id)}
              onDragOver={(e)=>onDragOver(e, projectId, t.id)}
              onDrop={(e)=>onDrop(e, projectId, t.id)}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div>
                <strong>{t.name}</strong>
              </div>
              <div>
                <button onClick={()=>addTask(projectId, t.id)}>+Sub</button>{' '}
                <button onClick={()=>removeTask(projectId, t.id)}>Del</button>
              </div>
            </div>
            {t.children && t.children.length>0 && renderTasks(projectId, t.children, depth+1)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <Head>
        <title>OpenTask — Dashboard</title>
      </Head>
      <main style={{fontFamily:'system-ui, sans-serif', padding:24}}>
        <h1>Dashboard</h1>
        <section style={{marginBottom:24}}>
          <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="New project title" />{' '}
          <button onClick={addProject}>Add Project</button>
        </section>

        <section style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
          {projects.map(proj=> (
            <div key={proj.id} style={{border:'1px solid #ccc', padding:12, background:'#f9f9f9'}}
                 onDragOver={(e)=>onDragOver(e, proj.id, null)}
                 onDrop={(e)=>onDrop(e, proj.id, null)}>
              <h3>{proj.title}</h3>
              <div style={{marginBottom:8}}>
                <button onClick={()=>addTask(proj.id)}>Add Task</button>
              </div>
              <div>
                {proj.tasks.length? renderTasks(proj.id, proj.tasks) : <em>No tasks</em>}
              </div>
            </div>
          ))}
        </section>
        <hr style={{marginTop:24}} />
        <p style={{fontSize:12, color:'#666'}}>Drag a task and drop it onto another task to make it a child, or drop it into the project area to make it top-level.</p>
      </main>
    </>
  )
}
