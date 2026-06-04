import Head from 'next/head'
import { useEffect, useState, useRef } from 'react'

function getStorageKey(email) {
  return email ? `opentask.v1:${email}` : 'opentask.v1:public'
}

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function saveState(state, email) { try { localStorage.setItem(getStorageKey(email), JSON.stringify(state)) } catch (e) { } }
function loadState(email) { try { return JSON.parse(localStorage.getItem(getStorageKey(email))) || null } catch (e) { return null } }

async function loadFromKV(email) {
  try {
    const url = email ? `/api/kv?owner=${encodeURIComponent(email)}` : '/api/kv'
    const r = await fetch(url)
    if (!r.ok) return null
    return await r.json()
  } catch (e) { return null }
}
async function saveToKV(state, email) {
  try {
    const url = email ? `/api/kv?owner=${encodeURIComponent(email)}` : '/api/kv'
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: state }) })
  } catch (e) { }
}

async function saveTaskToKV(task, projectId, email) {
  try {
    const { children, ...rest } = task
    const payload = {
      ...rest,
      id: task.id,
      name: task.name,
      parentId: task.parentId || null,
      projectId,
      childrenIds: (children || []).map(c => c.id)
    }
    const url = email ? `/api/kv?owner=${encodeURIComponent(email)}` : '/api/kv'
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: payload }) })
  } catch (e) { console.error(e) }
}
async function deleteTaskFromKV(projectId, id, email) {
  try {
    const url = email ? `/api/kv?owner=${encodeURIComponent(email)}` : '/api/kv'
    await fetch(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, id }) })
  } catch (e) { console.error(e) }
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

// Subcomponent for editing/displaying task details
function TaskDetails({ task, projectId, onSave, onDelete, email }) {
  const [name, setName] = useState(task.name || '')
  const [description, setDescription] = useState(task.description || '')
  const [priority, setPriority] = useState(task.priority || 'medium')
  const [difficulty, setDifficulty] = useState(task.difficulty || 'medium')
  const [dueDate, setDueDate] = useState(task.dueDate || '')
  const [uploading, setUploading] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    setName(task.name || '')
    setDescription(task.description || '')
    setPriority(task.priority || 'medium')
    setDifficulty(task.difficulty || 'medium')
    setDueDate(task.dueDate || '')
    setSaveStatus('')
  }, [task.id])

  const triggerSave = (updatedFields) => {
    onSave(updatedFields)
    setSaveStatus('Auto-saved!')
    setTimeout(() => setSaveStatus(''), 2000)
  }

  const handleSave = () => {
    onSave({ name, description, priority, difficulty, dueDate })
    setSaveStatus('Changes saved!')
    setTimeout(() => setSaveStatus(''), 2000)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const b64 = await toBase64(file)
      const url = email ? `/api/upload?owner=${encodeURIComponent(email)}` : '/api/upload'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          taskId: task.id,
          filename: file.name,
          contentBase64: b64
        })
      })
      if (res.ok) {
        const newAttachment = {
          filename: file.name,
          uploadedAt: new Date().toISOString(),
          size: file.size
        }
        const updatedAttachments = [...(task.attachments || []), newAttachment]
        onSave({ attachments: updatedAttachments })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-5 text-zinc-100">
      <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!task.completed}
            onChange={(e) => triggerSave({ completed: e.target.checked })}
            className="w-5 h-5 rounded border-zinc-600 bg-zinc-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-zinc-800 transition"
          />
          <span className="text-xs text-zinc-300 font-mono">ID: {task.id}</span>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus && <span className="text-xs text-emerald-400 font-medium">{saveStatus}</span>}
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-zinc-300 hover:text-rose-400 hover:bg-zinc-700 transition"
            title="Delete task"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Task Title</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => triggerSave({ name })}
          className="w-full text-lg font-bold bg-zinc-700/50 border border-zinc-600/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition"
          placeholder="Enter task name..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Priority</label>
          <div className="flex gap-1.5">
            {['low', 'medium', 'high'].map(p => {
              const isActive = priority === p
              const colors = {
                low: isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'hover:bg-zinc-700 text-zinc-300 border-transparent',
                medium: isActive ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 'hover:bg-zinc-700 text-zinc-300 border-transparent',
                high: isActive ? 'bg-rose-500/20 text-rose-400 border-rose-500/50' : 'hover:bg-zinc-700 text-zinc-300 border-transparent'
              }
              return (
                <button
                  key={p}
                  onClick={() => { setPriority(p); triggerSave({ priority: p }); }}
                  className={`flex-1 text-xs font-medium py-1.5 px-2 border rounded-lg capitalize transition ${colors[p]}`}
                >
                  {p}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Difficulty</label>
          <div className="flex gap-1.5">
            {['low', 'medium', 'hard'].map(d => {
              const isActive = difficulty === d
              const colors = {
                low: isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'hover:bg-zinc-700 text-zinc-300 border-transparent',
                medium: isActive ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 'hover:bg-zinc-700 text-zinc-300 border-transparent',
                hard: isActive ? 'bg-rose-500/20 text-rose-400 border-rose-500/50' : 'hover:bg-zinc-700 text-zinc-300 border-transparent'
              }
              return (
                <button
                  key={d}
                  onClick={() => { setDifficulty(d); triggerSave({ difficulty: d }); }}
                  className={`flex-1 text-xs font-medium py-1.5 px-2 border rounded-lg capitalize transition ${colors[d]}`}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1 col-span-2">
          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => { setDueDate(e.target.value); triggerSave({ dueDate: e.target.value }); }}
            className="w-full text-sm bg-zinc-700/50 border border-zinc-600/80 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => triggerSave({ description })}
          rows={4}
          className="w-full text-sm bg-zinc-700/50 border border-zinc-600/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition resize-none"
          placeholder="Add details, updates, or notes..."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Attachments</label>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Attach File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {uploading && (
          <div className="flex items-center gap-2 text-xs text-zinc-300 italic bg-zinc-700/30 p-2.5 rounded-xl border border-zinc-700">
            <svg className="animate-spin h-3.5 w-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Uploading attachment...
          </div>
        )}

        <div className="space-y-1.5">
          {task.attachments && task.attachments.length > 0 ? (
            task.attachments.map((att, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-zinc-700/40 border border-zinc-700 p-2.5 rounded-xl">
                <div className="flex items-center gap-2 truncate pr-2">
                  <svg className="w-4 h-4 text-zinc-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span className="truncate text-zinc-200 font-medium" title={att.filename}>{att.filename}</span>
                  {att.size && <span className="text-[10px] text-zinc-400">({Math.round(att.size / 1024)} KB)</span>}
                </div>
                <a
                  href={`/api/download?projectId=${projectId}&taskId=${task.id}&filename=${encodeURIComponent(att.filename)}${email ? `&owner=${encodeURIComponent(email)}` : ''}`}
                  download
                  className="text-xs text-indigo-400 hover:text-indigo-300 transition underline font-medium"
                >
                  Download
                </a>
              </div>
            ))
          ) : (
            <div className="text-xs text-zinc-400 italic text-center py-4 bg-zinc-700/20 border border-dashed border-zinc-700 rounded-xl">
              No files attached
            </div>
          )}
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          onClick={handleSave}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          Save Changes
        </button>
      </div>
    </div>
  )
}

export default function Dashboard({ userEmail }) {
  const [clientEmail, setClientEmail] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    setMounted(true)
    if (!userEmail) {
      const saved = localStorage.getItem('opentask.logged_in_email')
      if (saved) {
        setClientEmail(saved)
      }
    }
  }, [userEmail])

  const activeEmail = userEmail || clientEmail

  const handleMockLogin = (e) => {
    e.preventDefault()
    if (!emailInput.trim()) {
      setLoginError('Email address is required')
      return
    }
    if (!/\S+@\S+\.\S+/.test(emailInput)) {
      setLoginError('Please enter a valid email address')
      return
    }
    localStorage.setItem('opentask.logged_in_email', emailInput.trim())
    setClientEmail(emailInput.trim())
    setLoginError('')
  }

  const [projects, setProjects] = useState([])
  const [newProjectTitle, setNewProjectTitle] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [collapsedTasks, setCollapsedTasks] = useState({})
  
  const [modalOpen, setModalOpen] = useState(false)
  const [modalData, setModalData] = useState({ projectId: null, parentId: null, name: '', file: null })
  
  const [showAddProjectPanel, setShowAddProjectPanel] = useState(false)
  const [dragOverInfo, setDragOverInfo] = useState({ taskId: null, position: null })
  
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)

  // Fetch initial state
  useEffect(() => {
    if (!activeEmail) return
    (async () => {
      const s = loadState(activeEmail)
      if (s) setProjects(s)
      const kv = await loadFromKV(activeEmail)
      if (kv && Array.isArray(kv) && kv.length) {
        setProjects(kv)
        saveState(kv, activeEmail)
      } else {
        setProjects([])
      }
    })()
  }, [activeEmail])

  // Auto-save changes locally
  useEffect(() => {
    if (activeEmail) {
      saveState(projects, activeEmail)
    }
  }, [projects, activeEmail])

  // Reset selected task when project changes
  useEffect(() => {
    setSelectedTaskId(null)
  }, [selectedProjectId])

  const currentProject = projects.find(p => p.id === selectedProjectId) || null

  // Desktop Detail View defaults to the first task if not set
  const getFirstTask = (list) => {
    if (list && list.length > 0) return list[0]
    return null
  }

  const activeTask = selectedTaskId
    ? findTaskById(currentProject?.tasks || [], selectedTaskId)
    : getFirstTask(currentProject?.tasks || [])

  const activeTaskId = activeTask?.id || null

  function addProject() {
    if (!newProjectTitle.trim()) return
    const nextId = uid()
    setProjects(p => {
      const next = [{ id: nextId, title: newProjectTitle.trim(), tasks: [] }, ...p]
      saveState(next, activeEmail)
      saveToKV(next, activeEmail)
      return next
    })
    setSelectedProjectId(nextId)
    setNewProjectTitle('')
    setShowAddProjectPanel(false)
  }

  function deleteProject(id, e) {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this project?')) return
    setProjects(prev => {
      const cp = prev.filter(p => p.id !== id)
      saveState(cp, activeEmail)
      saveToKV(cp, activeEmail)
      return cp
    })
    if (selectedProjectId === id) {
      setSelectedProjectId(null)
    }
  }

  function openAddTaskModal(projectId, parentId = null) {
    setModalData({ projectId, parentId, name: '', file: null })
    setModalOpen(true)
  }

  async function submitModal() {
    const { projectId, parentId, name, file } = modalData
    if (!name || !projectId) return
    const newTaskId = uid()
    const newTask = {
      id: newTaskId,
      name,
      completed: false,
      description: '',
      priority: 'medium',
      difficulty: 'medium',
      dueDate: '',
      attachments: [],
      children: []
    }

    setProjects(prev => {
      const cp = JSON.parse(JSON.stringify(prev))
      const proj = cp.find(x => x.id === projectId)
      if (!parentId) {
        proj.tasks.push(newTask)
      } else {
        const parent = findTaskById(proj.tasks, parentId)
        if (parent) {
          parent.children = parent.children || []
          parent.children.push(newTask)
        }
      }
      saveState(cp, activeEmail)
      saveTaskToKV(newTask, projectId, activeEmail)
      return cp
    })

    setSelectedTaskId(newTaskId)

    if (file) {
      try {
        const b64 = await toBase64(file)
        const url = activeEmail ? `/api/upload?owner=${encodeURIComponent(activeEmail)}` : '/api/upload'
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, taskId: newTaskId, filename: file.name, contentBase64: b64 })
        })
        if (res.ok) {
          const newAttachment = {
            filename: file.name,
            uploadedAt: new Date().toISOString(),
            size: file.size
          }
          handleUpdateTask(newTaskId, { attachments: [newAttachment] })
        }
      } catch (e) {
        console.error(e)
      }
    }
    setModalOpen(false)
  }

  function findTaskById(tasks, id) {
    for (const t of tasks) {
      if (t.id === id) return t
      const f = findTaskById(t.children || [], id)
      if (f) return f
    }
    return null
  }

  function removeTask(projectId, taskId) {
    setProjects(prev => {
      const cp = JSON.parse(JSON.stringify(prev))
      const proj = cp.find(x => x.id === projectId)
      if (!proj) return prev
      const [newTasks, removed] = removeTaskById(proj.tasks, taskId)
      proj.tasks = newTasks
      saveState(cp, activeEmail)
      if (removed) {
        const ids = gatherIds(removed)
        ids.forEach(id => deleteTaskFromKV(projectId, id, activeEmail))
      }
      return cp
    })
  }

  function removeTaskById(list, id) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        const rem = list[i]
        const newList = [...list.slice(0, i), ...list.slice(i + 1)]
        return [newList, rem]
      }
      if (list[i].children && list[i].children.length) {
        const [nc, removed] = removeTaskById(list[i].children, id)
        if (removed) {
          const newItem = { ...list[i], children: nc }
          return [[...list.slice(0, i), newItem, ...list.slice(i + 1)], removed]
        }
      }
    }
    return [list, null]
  }

  function gatherIds(node) {
    const ids = [node.id]
    if (node.children) {
      for (const c of node.children) {
        ids.push(...gatherIds(c))
      }
    }
    return ids
  }

  function insertTaskAt(list, targetId, position, task) {
    if (!targetId) {
      if (position === 'after') return [...list, task]
      return [task, ...list]
    }
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === targetId) {
        if (position === 'inside') {
          const children = list[i].children ? [task, ...list[i].children] : [task]
          const n = { ...list[i], children }
          return [...list.slice(0, i), n, ...list.slice(i + 1)]
        }
        if (position === 'before') return [...list.slice(0, i), task, ...list.slice(i)]
        return [...list.slice(0, i + 1), task, ...list.slice(i + 1)]
      }
      if (list[i].children && list[i].children.length) {
        const newChildren = insertTaskAt(list[i].children, targetId, position, task)
        if (newChildren !== list[i].children) {
          const n = { ...list[i], children: newChildren }
          return [...list.slice(0, i), n, ...list.slice(i + 1)]
        }
      }
    }
    return list
  }

  const handleUpdateTask = (taskId, fields) => {
    setProjects(prev => {
      const cp = JSON.parse(JSON.stringify(prev))
      const proj = cp.find(x => x.id === selectedProjectId)
      if (!proj) return prev
      const task = findTaskById(proj.tasks, taskId)
      if (!task) return prev
      Object.assign(task, fields)
      saveState(cp, activeEmail)
      saveTaskToKV(task, proj.id, activeEmail)
      return cp
    })
  }

  const handleDeleteTask = (taskId) => {
    if (selectedTaskId === taskId) {
      setSelectedTaskId(null)
    }
    removeTask(selectedProjectId, taskId)
  }

  const toggleCollapse = (taskId, e) => {
    e.stopPropagation()
    setCollapsedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }))
  }

  function onDragStart(e, projectId, taskId) {
    dragItem.current = { projectId, taskId }
    e.dataTransfer.setData('text/plain', JSON.stringify(dragItem.current))
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e, projectId, overTaskId = null) {
    e.preventDefault()
    let pos = 'inside'
    try {
      const t = e.currentTarget
      const r = t.getBoundingClientRect()
      const rel = (e.clientY - r.top) / r.height
      if (rel <= 0.25) pos = 'before'
      else if (rel >= 0.75) pos = 'after'
      else pos = 'inside'
    } catch (err) {
      pos = 'inside'
    }
    dragOverItem.current = { projectId, overTaskId, position: pos }
    setDragOverInfo({ taskId: overTaskId, position: pos })
  }

  function onDragLeave() {
    setDragOverInfo({ taskId: null, position: null })
  }

  function onDrop(e, projectId, overTaskId = null) {
    e.preventDefault()
    setDragOverInfo({ taskId: null, position: null })
    const src = dragItem.current
    const dest = dragOverItem.current || { projectId, overTaskId, position: overTaskId ? 'inside' : 'start' }
    if (!src) return
    if (src.projectId !== dest.projectId) return

    setProjects(prev => {
      const cp = JSON.parse(JSON.stringify(prev))
      const proj = cp.find(x => x.id === src.projectId)
      if (!proj) return cp
      const [newTasks, removed] = removeTaskById(proj.tasks, src.taskId)
      proj.tasks = newTasks
      if (!removed) return cp

      proj.tasks = insertTaskAt(proj.tasks, dest.overTaskId, dest.position, removed)
      saveState(cp, activeEmail)
      
      const updated = removed
      updated.parentId = dest.overTaskId || null
      saveTaskToKV(updated, proj.id, activeEmail)
      return cp
    })

    dragItem.current = null
    dragOverItem.current = null
  }

  function renderTasks(projectId, tasks, depth = 0) {
    return (
      <ul className={`${depth ? 'pl-5 border-l border-zinc-700/80 ml-2.5' : ''}`}>
        {tasks.map(t => {
          const isTaskActive = activeTaskId === t.id
          const hasChildren = t.children && t.children.length > 0
          const isCollapsed = !!collapsedTasks[t.id]
          
          const isDragTarget = dragOverInfo.taskId === t.id
          let dragStyle = 'border-zinc-700/80'
          if (isDragTarget) {
            if (dragOverInfo.position === 'before') dragStyle = 'border-t-2 border-t-indigo-500 border-b-zinc-700/80'
            else if (dragOverInfo.position === 'after') dragStyle = 'border-b-2 border-b-indigo-500 border-t-zinc-700/80'
            else dragStyle = 'border-indigo-500/80 bg-indigo-500/5'
          }

          const priorityColors = {
            high: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
            medium: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
            low: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }

          const difficultyBg = {
            low: 'bg-emerald-950/25 border-l-2 border-l-emerald-500/60 hover:bg-emerald-950/35',
            medium: 'bg-amber-950/25 border-l-2 border-l-amber-500/60 hover:bg-amber-950/35',
            hard: 'bg-rose-950/25 border-l-2 border-l-rose-500/60 hover:bg-rose-950/35'
          }

          const difficultyColors = {
            hard: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
            medium: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
            low: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }

          const currentDifficulty = t.difficulty || 'medium'
          const bgStyle = difficultyBg[currentDifficulty]

          return (
            <li
              key={t.id}
              className={`rounded-none border-b border-zinc-700/80 last:border-b-0 ${dragStyle} transition-all duration-200 group ${bgStyle}`}
              draggable
              onDragStart={(e) => onDragStart(e, projectId, t.id)}
              onDragOver={(e) => onDragOver(e, projectId, t.id)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, projectId, t.id)}
            >
              {/* Task Row Header */}
              <div
                onClick={() => setSelectedTaskId(isTaskActive ? null : t.id)}
                className={`flex items-center justify-between p-3.5 cursor-pointer rounded-none transition ${isTaskActive ? 'bg-zinc-700/50' : 'hover:bg-zinc-700/20'}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {/* Collapsible toggle */}
                    <button
                      onClick={(e) => toggleCollapse(t.id, e)}
                      className={`p-0.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition ${hasChildren ? 'opacity-100' : 'opacity-0 cursor-default'}`}
                    >
                      <svg className={`w-3.5 h-3.5 transform transition-transform ${isCollapsed ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {/* Complete Checkbox */}
                    <input
                      type="checkbox"
                      checked={!!t.completed}
                      onChange={(e) => {
                        e.stopPropagation()
                        handleUpdateTask(t.id, { completed: e.target.checked })
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4.5 h-4.5 rounded border-zinc-600 bg-zinc-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-zinc-800 transition"
                    />
                  </div>

                  <div className="truncate flex-1 min-w-0">
                    <span className={`text-sm font-semibold truncate block ${t.completed ? 'line-through text-zinc-400 font-normal' : 'text-zinc-100'}`}>
                      {t.name}
                    </span>
                    {/* Inline badges */}
                    <div className="flex lg:hidden items-center gap-2 mt-1">
                      {t.priority && (
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md tracking-wider ${priorityColors[t.priority]}`}>
                          {t.priority}
                        </span>
                      )}
                      {t.difficulty && (
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md tracking-wider ${difficultyColors[t.difficulty]}`}>
                          {t.difficulty}
                        </span>
                      )}
                      {t.dueDate && (
                        <span className="text-[10px] text-zinc-300 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {t.dueDate}
                        </span>
                      )}
                      {t.attachments && t.attachments.length > 0 && (
                        <span className="text-[10px] text-indigo-400 flex items-center gap-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </svg>
                          {t.attachments.length}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Task Hover buttons */}
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); openAddTaskModal(projectId, t.id) }}
                    className="p-1 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-600 transition"
                    title="Add Subtask"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTask(t.id) }}
                    className="p-1 rounded-md text-zinc-300 hover:text-rose-400 hover:bg-zinc-600 transition"
                    title="Delete Task"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* MOBILE Accordion Detail View */}
              {isTaskActive && (
                <div className="lg:hidden p-4 border-t border-zinc-700 bg-zinc-800/80 rounded-none">
                  <TaskDetails
                    task={t}
                    projectId={projectId}
                    onSave={(fields) => handleUpdateTask(t.id, fields)}
                    onDelete={() => handleDeleteTask(t.id)}
                    email={activeEmail}
                  />
                </div>
              )}

              {/* Nested Tasks */}
              {hasChildren && !isCollapsed && renderTasks(projectId, t.children, depth + 1)}
            </li>
          )
        })}
      </ul>
    )
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-zinc-800 text-zinc-50 flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    )
  }

  if (!activeEmail) {
    return (
      <>
        <Head>
          <title>Sign In — OpenTask</title>
        </Head>
        <main className="min-h-screen bg-zinc-800 text-zinc-50 flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/20 via-zinc-800 to-zinc-800">
          <div className="absolute top-1/4 left-1/2 -tranzinc-x-1/2 -tranzinc-y-1/2 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
          <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] bg-cyan-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

          <div className="max-w-md w-full space-y-8 relative z-10">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-2xl shadow-indigo-500/30 mb-2">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
                </svg>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-50 to-zinc-200 bg-clip-text text-transparent">
                OpenTask
              </h1>
              <p className="text-zinc-300 text-sm max-w-xs">
                Premium workspace gated by Cloudflare Access. Please authenticate to access your tasks.
              </p>
            </div>

            <div className="bg-zinc-800/40 border border-zinc-700/80 rounded-3xl p-8 backdrop-blur-xl shadow-2xl space-y-6">
              <div className="space-y-1.5 text-center sm:text-left">
                <h2 className="text-xl font-bold text-white">Sign In</h2>
                <p className="text-xs text-zinc-300">
                  Enter your email below to access or create your workspace.
                </p>
              </div>

              <form onSubmit={handleMockLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider block">Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400 pointer-events-none">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.206" />
                      </svg>
                    </span>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value)
                        if (loginError) setLoginError('')
                      }}
                      className={`w-full bg-zinc-900/60 border ${loginError ? 'border-rose-500/80 focus:border-rose-500' : 'border-zinc-700 focus:border-indigo-500'} rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-400 focus:outline-none transition-all duration-200`}
                      placeholder="you@example.com"
                      autoFocus
                    />
                  </div>
                  {loginError && (
                    <p className="text-xs text-rose-400 font-medium flex items-center gap-1 mt-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {loginError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-semibold py-3 px-4 rounded-2xl shadow-xl shadow-indigo-600/20 transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 text-sm"
                >
                  Enter Workspace
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </form>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-zinc-700/80"></div>
                <span className="flex-shrink mx-3 text-[10px] text-zinc-400 uppercase tracking-widest font-semibold">Cloudflare Access Security</span>
                <div className="flex-grow border-t border-zinc-700/80"></div>
              </div>

              <div className="text-[11px] text-zinc-400 leading-relaxed text-center bg-zinc-900/40 border border-zinc-800/60 p-3 rounded-xl">
                Note: In production environments, authentication is managed securely by Cloudflare. This prompt simulates identity validation for local development and sandbox setups.
              </div>
            </div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>OpenTask — Premium Workspace</title>
      </Head>
      <div className="min-h-screen bg-zinc-800 text-zinc-50 flex flex-col lg:flex-row bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950/20 via-zinc-800 to-zinc-800">
        
        {/* SIDEBAR: Dashboard Left (Visible on desktop; or hidden on mobile when project is open) */}
        <aside className={`lg:w-80 border-r border-zinc-700/80 flex flex-col flex-shrink-0 bg-zinc-800/40 backdrop-blur-xl ${selectedProjectId ? 'hidden lg:flex' : 'flex w-full'}`}>
          {/* Header */}
          <div className="p-6 border-b border-zinc-700/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-zinc-50 to-zinc-200 bg-clip-text text-transparent">OpenTask</h1>
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Enterprise workspace</span>
              </div>
            </div>
          </div>

          {/* Navigation / Projects Quicklist */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">My Projects</span>
              <button
                onClick={() => setShowAddProjectPanel(!showAddProjectPanel)}
                className="p-1 rounded bg-zinc-700/50 hover:bg-zinc-700 border border-zinc-600/50 text-indigo-400 hover:text-indigo-300 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            {/* Quick Add Project Form */}
            {showAddProjectPanel && (
              <div className="bg-zinc-800 border border-zinc-700 p-3 rounded-xl space-y-2.5 animate-fadeIn">
                <input
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  placeholder="Project name..."
                  className="w-full text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-indigo-500"
                  onKeyDown={(e) => { if (e.key === 'Enter') addProject() }}
                />
                <div className="flex justify-end gap-2 text-[10px]">
                  <button onClick={() => setShowAddProjectPanel(false)} className="px-2 py-1 rounded hover:bg-zinc-700 text-zinc-300">Cancel</button>
                  <button onClick={addProject} className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow">Create</button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              {projects.length > 0 ? (
                projects.map(p => {
                  const isProjSelected = selectedProjectId === p.id
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedProjectId(p.id)}
                      className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition ${isProjSelected ? 'bg-gradient-to-r from-indigo-600/20 to-indigo-600/5 border border-indigo-500/20 text-white shadow-inner' : 'hover:bg-zinc-700/40 border border-transparent text-zinc-300 hover:text-zinc-100'}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <svg className={`w-4 h-4 flex-shrink-0 ${isProjSelected ? 'text-indigo-400' : 'text-zinc-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        <span className="text-sm font-semibold truncate">{p.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isProjSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-zinc-700 text-zinc-400'}`}>
                          {p.tasks?.length || 0}
                        </span>
                        <button
                          onClick={(e) => deleteProject(p.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-rose-400 transition"
                          title="Delete project"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8 text-xs text-zinc-400 italic">
                  No projects available. Click the plus button to create one.
                </div>
              )}
            </div>
          </div>

          {/* User Profile Footer */}
          <div className="p-4 border-t border-zinc-700/80 bg-zinc-900/20 flex flex-col gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* User Avatar */}
              <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 font-bold text-sm flex-shrink-0 uppercase">
                {activeEmail ? activeEmail[0] : 'U'}
              </div>
              {/* Email details */}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-zinc-100 truncate">
                  {activeEmail}
                </p>
                <p className="text-[10px] text-zinc-400 truncate">
                  {userEmail ? 'Verified via Access' : 'Local Sandbox Mode'}
                </p>
              </div>
            </div>
            
            {/* Sign Out Button */}
            <button
              onClick={() => {
                if (userEmail) {
                  window.location.href = '/cdn-cgi/access/logout'
                } else {
                  localStorage.removeItem('opentask.logged_in_email')
                  setClientEmail(null)
                }
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border border-zinc-700/80 hover:border-rose-900/30 bg-zinc-800/40 hover:bg-rose-950/10 text-zinc-300 hover:text-rose-400 text-xs font-semibold transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </aside>

        {/* MAIN PANEL */}
        <main className={`flex-1 flex flex-col min-w-0 ${!selectedProjectId ? 'hidden lg:flex' : 'flex'}`}>
          {currentProject ? (
            <>
              {/* Project Title Bar / Top Nav */}
              <header className="h-16 border-b border-zinc-700/80 px-6 flex items-center bg-zinc-800/20 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedProjectId(null)}
                    className="p-2 -ml-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-700 transition lg:hidden"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      {currentProject.title}
                    </h2>
                    <span className="text-[10px] text-zinc-300 font-mono">Project ID: {currentProject.id}</span>
                  </div>
                </div>
              </header>

              {/* Dashboard Inner Grid */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Column: Tasks Listing */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
                      <div className="flex items-center gap-3.5">
                        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Tasks Tree</h3>
                        <button
                          onClick={() => openAddTaskModal(currentProject.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                          </svg>
                          New Task
                        </button>
                      </div>
                      <span className="text-xs text-zinc-400 font-medium">Drag to reorder hierarchy</span>
                    </div>

                    <div
                      onDragOver={(e) => onDragOver(e, currentProject.id, null)}
                      onDrop={(e) => onDrop(e, currentProject.id, null)}
                      className="min-h-[300px] rounded-none transition"
                    >
                      {currentProject.tasks && currentProject.tasks.length > 0 ? (
                        renderTasks(currentProject.id, currentProject.tasks)
                      ) : (
                        <div className="text-center py-16 bg-zinc-800/20 border border-dashed border-zinc-700 rounded-2xl">
                          <svg className="w-12 h-12 text-zinc-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
                          </svg>
                          <p className="text-sm font-semibold text-zinc-300">No tasks in this project yet</p>
                          <p className="text-xs text-zinc-400 mt-1 max-w-[240px] mx-auto">Create a parent task to start planning your workflow.</p>
                          <button
                            onClick={() => openAddTaskModal(currentProject.id)}
                            className="mt-4 inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold border border-indigo-500/20 bg-indigo-500/5 px-3 py-1.5 rounded-lg transition"
                          >
                            Add First Task
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Selected Task Details (Hidden on mobile, accordion fallback) */}
                  <div className="hidden lg:block lg:col-span-5 sticky top-6">
                    <div className="bg-zinc-800/40 border border-zinc-700/80 rounded-2xl p-6 backdrop-blur-md shadow-xl">
                      {activeTask ? (
                        <TaskDetails
                          task={activeTask}
                          projectId={currentProject.id}
                          onSave={(fields) => handleUpdateTask(activeTask.id, fields)}
                          onDelete={() => handleDeleteTask(activeTask.id)}
                          email={activeEmail}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 italic">
                          <svg className="w-14 h-14 mb-4 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                          </svg>
                          <span className="text-sm text-zinc-300 font-medium">Select a task</span>
                          <span className="text-xs text-zinc-400 mt-0.5">Click any task from the tree to view and manage details.</span>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </>
          ) : (
            // Dashboard Welcome State (When no project is selected)
             <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/10 via-zinc-800 to-zinc-800">
              <div className="max-w-md w-full text-center space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mx-auto shadow-inner shadow-indigo-500/5">
                  <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-white">Welcome to OpenTask</h2>
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    Select an existing project from the sidebar to check your tasks, or create a brand new workspace to organize your next roadmap.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setShowAddProjectPanel(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-xl shadow-indigo-600/25 transition-all hover:scale-[1.02]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                    </svg>
                    Create New Project
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Task Creation Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-800 border border-zinc-700 w-full max-w-lg rounded-2xl shadow-2xl p-6 text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                New Task
              </h4>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-700 transition"
              >
                ✕
              </button>
            </div>
            
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">Task Title</label>
                <input
                  autoFocus
                  className="w-full bg-zinc-700/50 border border-zinc-600 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 transition"
                  placeholder="What needs to be done?"
                  value={modalData.name}
                  onChange={(e) => setModalData(d => ({ ...d, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitModal() }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1">Attach initial file (optional)</label>
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-zinc-700 border-dashed rounded-xl cursor-pointer bg-zinc-700/20 hover:bg-zinc-700/40 hover:border-zinc-600 transition">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <svg className="w-8 h-8 mb-2.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      {modalData.file ? (
                        <p className="text-xs font-semibold text-indigo-400">{modalData.file.name}</p>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-zinc-300">Click to upload file</p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">PDF, PNG, JPG, ZIP etc. up to 10MB</p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setModalData(d => ({ ...d, file: e.target.files?.[0] || null }))}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-zinc-700 pt-4">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={submitModal}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/20 transition text-sm"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export const runtime = 'experimental-edge'

export async function getServerSideProps(context) {
  const req = context.req
  const h = req.headers || {}
  
  function base64UrlDecodeToJson(payload) {
    try {
      let str = payload.replace(/-/g, '+').replace(/_/g, '/')
      while (str.length % 4) str += '='
      const binary = atob(str)
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

  function ownerFromReq(req) {
    const candidates = [
      h['cf-access-authenticated-user-email'],
      h['x-authenticated-user-email'],
      h['x-forwarded-user-email'],
      h['email'],
      h['x-user-email']
    ]
    for (const c of candidates) if (c) return Array.isArray(c) ? c[0] : c
    const jwt = h['cf-access-jwt-assertion'] || h['cf-access-jwt'] || h['x-forwarded-jwt'] || h['authorization']
    if (jwt) {
      const tok = Array.isArray(jwt) ? jwt[0] : jwt
      const maybe = tok.replace(/^Bearer\s+/i, '')
      const email = tryDecodeJwtForEmail(maybe)
      if (email) return email
    }
    if (context.query && context.query.owner) return context.query.owner
    return null
  }

  const email = ownerFromReq(req)

  return {
    props: {
      userEmail: email || null
    }
  }
}
