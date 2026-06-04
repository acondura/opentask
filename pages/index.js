import Head from 'next/head'
import Link from 'next/link'

export default function Home() {
  return (
    <>
      <Head>
        <title>OpenTask — Elegant Task Management</title>
        <meta name="description" content="A premium hierarchical task manager with drag-and-drop organisation, file attachments, and flexible desktop/mobile workspace interfaces." />
      </Head>
      <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/20 via-slate-900 to-slate-900">
        {/* Glow Decoration */}
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="max-w-4xl w-full text-center space-y-8 py-12">
          {/* Logo Brand */}
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-2xl shadow-indigo-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" />
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              OpenTask
            </h1>
          </div>

          {/* Title Hero */}
          <div className="space-y-4">
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.1] text-white">
              Hierarchical Task <br />
              <span className="bg-gradient-to-r from-indigo-400 via-indigo-500 to-cyan-400 bg-clip-text text-transparent">
                Management
              </span>
            </h2>
            <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Organise tasks in a nested tree structure, adjust scope with drag-and-drop, and track progress.
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/dashboard" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base shadow-xl shadow-indigo-600/30 hover:shadow-indigo-600/40 transition hover:scale-[1.02]">
              Enter Workspace
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12 text-left">
            
            <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-md space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white">Hierarchical Trees</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Nest tasks to any depth to keep your workspace structured.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-md space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0V12m-3 .5a1.5 1.5 0 003 0M10 12V7.5a1.5 1.5 0 113 0V12m-3 0a1.5 1.5 0 003 0M13 12v-3a1.5 1.5 0 113 0V12m-3 0a1.5 1.5 0 003 0m0 0V5.5A1.5 1.5 0 0117.5 4H18a1.5 1.5 0 011.5 1.5V13a6 6 0 11-12 0v-1.5" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white">Drag & Drop</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Reorganise priorities and move tasks between groups.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-md space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white">Responsive Display</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Dual-pane explorer optimized for both desktop and mobile screens.
              </p>
            </div>

          </div>

          {/* Footer branding */}
          <footer className="pt-16 border-t border-slate-900 text-xs text-slate-600 flex justify-between items-center">
            <span>&copy; {new Date().getFullYear()} OpenTask. All rights reserved.</span>
            <div className="flex gap-4">
              <span className="hover:text-slate-400 cursor-pointer">Privacy Policy</span>
              <span className="hover:text-slate-400 cursor-pointer">Terms of Service</span>
            </div>
          </footer>
        </div>
      </main>
    </>
  )
}
