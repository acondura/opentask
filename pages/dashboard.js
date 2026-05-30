import Head from 'next/head'
import { useEffect, useState, useRef } from 'react'

const STORAGE_KEY = 'opentask.v1'

function uid() { return Math.random().toString(36).slice(2,9) }

function saveState(state){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }catch(e){} }
function loadState(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null }catch(e){ return null }}

async function loadFromKV(){ try{ const r = await fetch('/api/kv'); if(!r.ok) return null; return await r.json() }catch(e){return null} }
async function saveToKV(state){ try{ await fetch('/api/kv',{method:'POST',headers:{'Content-Type':'application/json'},body: JSON.stringify({data:state})}) }catch(e){} }

async function saveTaskToKV(task, projectId){ try{ const payload = {id:task.id,name:task.name,parentId:task.parentId||null,projectId,childrenIds:(task.children||[]).map(c=>c.id)}; await fetch('/api/kv',{method:'POST',headers:{'Content-Type':'application/json'},body: JSON.stringify({data:payload})}) }catch(e){console.error(e)} }
async function deleteTaskFromKV(projectId, id){ try{ await fetch('/api/kv',{method:'DELETE',headers:{'Content-Type':'application/json'},body: JSON.stringify({projectId,id})}) }catch(e){console.error(e)} }

export default function Dashboard(){
  const [projects,setProjects] = useState([])
  const [title,setTitle] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [modalOpen,setModalOpen] = useState(false)
  const [modalData,setModalData] = useState({projectId:null,parentId:null,name:'',file:null})
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)

  useEffect(()=>{ (async()=>{ const s = loadState(); if(s) setProjects(s); const kv = await loadFromKV(); if(kv && Array.isArray(kv) && kv.length){ setProjects(kv); saveState(kv) } })() },[])

  useEffect(()=>{ saveState(projects) },[projects])

  function addProject(){ if(!title.trim()) return; setProjects(p=>{ const next=[{id:uid(),title:title.trim(),tasks:[]} , ...p]; saveState(next); saveToKV(next); return next }); setTitle('') }

  function openAddTaskModal(projectId,parentId=null){ setModalData({projectId,parentId,name:'',file:null}); setModalOpen(true) }

  async function submitModal(){ const {projectId,parentId,name,file} = modalData; if(!name||!projectId) return; const newTaskId = uid(); setProjects(prev=>{ const cp = JSON.parse(JSON.stringify(prev)); const proj = cp.find(x=>x.id===projectId); const newTask={id:newTaskId,name,children:[]}; if(!parentId) proj.tasks.unshift(newTask); else{ const parent = findTaskById(proj.tasks,parentId); parent.children.unshift(newTask) } saveState(cp); saveTaskToKV(newTask,projectId); return cp }); if(file){ try{ const b64 = await toBase64(file); await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body: JSON.stringify({projectId,taskId:newTaskId,filename:file.name,contentBase64:b64})}) }catch(e){console.error(e)} } setModalOpen(false) }

  function toBase64(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file) }) }

  function findTaskById(tasks,id){ for(const t of tasks){ if(t.id===id) return t; const f=findTaskById(t.children||[],id); if(f) return f } return null }

  function removeTask(projectId,taskId){ setProjects(prev=>{ const cp=JSON.parse(JSON.stringify(prev)); const proj = cp.find(x=>x.id===projectId); const [newTasks,removed]=removeTaskById(proj.tasks,taskId); proj.tasks=newTasks; saveState(cp); if(removed){ const ids=gatherIds(removed); ids.forEach(id=>deleteTaskFromKV(projectId,id)) } return cp }) }

  function removeTaskById(list,id){ for(let i=0;i<list.length;i++){ if(list[i].id===id){ const rem=list[i]; const newList=[...list.slice(0,i),...list.slice(i+1)]; return [newList,rem] } if(list[i].children && list[i].children.length){ const [nc,removed]=removeTaskById(list[i].children,id); if(removed){ const newItem = {...list[i], children: nc}; return [[...list.slice(0,i), newItem, ...list.slice(i+1)], removed] } } } return [list,null] }

  function gatherIds(node){ const ids=[node.id]; if(node.children) for(const c of node.children) ids.push(...gatherIds(c)); return ids }

  function insertTaskAt(list,targetId,position,task){ if(!targetId){ if(position==='after') return [...list,task]; return [task,...list] } for(let i=0;i<list.length;i++){ if(list[i].id===targetId){ if(position==='inside'){ const children = list[i].children ? [task,...list[i].children] : [task]; const n={...list[i],children}; return [...list.slice(0,i),n,...list.slice(i+1)] } if(position==='before') return [...list.slice(0,i),task,...list.slice(i)]; return [...list.slice(0,i+1),task,...list.slice(i+1)] } if(list[i].children && list[i].children.length){ const newChildren = insertTaskAt(list[i].children,targetId,position,task); if(newChildren !== list[i].children){ const n={...list[i], children:newChildren}; return [...list.slice(0,i), n, ...list.slice(i+1)] } } } return list }

  function onDragStart(e,projectId,taskId){ dragItem.current={projectId,taskId}; e.dataTransfer.setData('text/plain',JSON.stringify(dragItem.current)); e.dataTransfer.effectAllowed='move' }
  function onDragOver(e,projectId,overTaskId=null){ e.preventDefault(); let pos='inside'; try{ const t=e.currentTarget; const r=t.getBoundingClientRect(); const rel=(e.clientY-r.top)/r.height; if(rel<=0.25) pos='before'; else if(rel>=0.75) pos='after'; else pos='inside' }catch(e){pos='inside'} dragOverItem.current={projectId,overTaskId,position:pos} }
  function onDrop(e,projectId,overTaskId=null){ e.preventDefault(); const src=dragItem.current; const dest = dragOverItem.current || {projectId,overTaskId,position: overTaskId? 'inside':'start'}; if(!src) return; if(src.projectId!==dest.projectId) return; setProjects(prev=>{ const cp=JSON.parse(JSON.stringify(prev)); const proj=cp.find(x=>x.id===src.projectId); const [newTasks,removed]=removeTaskById(proj.tasks,src.taskId); proj.tasks=newTasks; if(!removed) return cp; proj.tasks = insertTaskAt(proj.tasks,dest.overTaskId,dest.position,removed); saveState(cp); const updated = removed; updated.parentId = dest.overTaskId || null; saveTaskToKV(updated,proj.id); return cp }) ; dragItem.current=null; dragOverItem.current=null }

  function renderTasks(projectId,tasks,depth=0){ return (
    <ul className={`space-y-2 ${depth ? 'pl-4' : ''}`}>
      {tasks.map(t=> (
        <li key={t.id} className="border border-gray-200 p-2 bg-white rounded" draggable onDragStart={(e)=>onDragStart(e,projectId,t.id)} onDragOver={(e)=>onDragOver(e,projectId,t.id)} onDrop={(e)=>onDrop(e,projectId,t.id)}>
          <div className="flex justify-between items-center">
            <div className="font-medium">{t.name}</div>
            <div className="flex gap-2">
              <button className="text-sm px-2 py-1 bg-gray-100 rounded" onClick={()=>openAddTaskModal(projectId,t.id)}>+Sub</button>
              <button className="text-sm px-2 py-1 bg-red-100 rounded" onClick={()=>removeTask(projectId,t.id)}>Del</button>
            </div>
          </div>
          {t.children && t.children.length>0 && renderTasks(projectId,t.children,depth+1)}
        </li>
      ))}
    </ul>
  ) }

  return (
    <>
      <Head />
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <header className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-extrabold tracking-tight">OpenTask</h1>
              <p className="text-sm text-gray-500">Lightweight project & task manager</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="text-sm px-3 py-1 bg-indigo-50 text-indigo-700 rounded">New project</button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-3xl font-bold">Dashboard</h2>
              <p className="text-sm text-gray-500">Create projects, add tasks and organize them hierarchically.</p>
            </div>
            <div className="flex items-center gap-2">
              <input className="border rounded p-2 shadow-sm" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="New project title" />
              <button onClick={addProject} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md shadow">Add Project</button>
            </div>
          </div>

          {/* Project quick-list */}
          <div className="mb-6">
            <div className="flex flex-wrap gap-2">
              <button onClick={()=>setSelectedProjectId(null)} className={`px-3 py-1 rounded-full ${selectedProjectId===null? 'bg-indigo-600 text-white':'bg-white border'}`}>All</button>
              {projects.map(p=> (
                <button key={p.id} onClick={()=>setSelectedProjectId(p.id)} className={`px-3 py-1 rounded-full ${selectedProjectId===p.id? 'bg-indigo-600 text-white':'bg-white border'}`}>
                  {p.title}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.filter(pr => !selectedProjectId || pr.id === selectedProjectId).map(proj=> (
              <article key={proj.id} className="card p-6" onDragOver={(e)=>onDragOver(e,proj.id,null)} onDrop={(e)=>onDrop(e,proj.id,null)}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold">{proj.title}</h3>
                    <div className="mt-2 text-sm text-slate-500">{proj.tasks.length} tasks</div>
                  </div>
                  <div>
                    <button onClick={()=>openAddTaskModal(proj.id)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gradient-to-r from-teal-400 to-cyan-500 text-white hover:from-teal-500 hover:to-cyan-600 shadow">+ Task</button>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {proj.tasks.length? renderTasks(proj.id,proj.tasks) : <div className="text-sm text-slate-400 italic">No tasks — add one</div>}
                </div>
              </article>
            ))}
          </div>

          {modalOpen && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
              <div className="bg-white w-full max-w-lg rounded-lg shadow-lg p-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold">New Task</h4>
                  <button onClick={()=>setModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Task name</label>
                    <input className="mt-1 block w-full border rounded p-2" value={modalData.name} onChange={(e)=>setModalData(d=>({...d,name:e.target.value}))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Attach file</label>
                    <input type="file" className="mt-1" onChange={(e)=>setModalData(d=>({...d,file: e.target.files?.[0]}))} />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button onClick={()=>setModalOpen(false)} className="px-4 py-2 rounded border">Cancel</button>
                  <button onClick={submitModal} className="px-4 py-2 rounded bg-indigo-600 text-white">Add Task</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
